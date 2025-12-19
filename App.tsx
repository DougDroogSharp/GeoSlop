
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { 
  Search, 
  MapPin, 
  Send, 
  Loader2, 
  Sparkles, 
  Image as ImageIcon, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Minus,
  Map as MapIcon,
  Zap,
  Globe,
  Home,
  X,
  Compass,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';
import { GeminiService, VisualLandmark } from './services/geminiService';
import { Message, UserLocation, LocationResult } from './types';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

const isValidCoord = (val: any): val is number => typeof val === 'number' && !isNaN(val);

const EyeDrone = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <style>
      {`
        .propeller { transform-origin: center; animation: spin 0.2s linear infinite; }
        .eye-ball { fill: #f8fafc; stroke: #1e293b; stroke-width: 2; }
        .pupil { fill: #2563eb; animation: look 4s ease-in-out infinite; }
        .lens-flare { fill: white; opacity: 0.6; }
        @keyframes spin { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes look {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(5px, -3px); }
          50% { transform: translate(-4px, 2px); }
          75% { transform: translate(3px, 4px); }
        }
      `}
    </style>
    <g className="propeller">
      <rect x="20" y="5" width="60" height="4" rx="2" fill="#475569" />
      <circle cx="50" y="7" r="3" fill="#1e293b" />
    </g>
    <rect x="48" y="7" width="4" height="15" fill="#94a3b8" />
    <circle className="eye-ball" cx="50" cy="55" r="35" />
    <circle className="pupil" cx="50" cy="55" r="15" />
    <circle cx="50" cy="55" r="6" fill="#0f172a" />
    <circle className="lens-flare" cx="42" cy="45" r="4" />
  </svg>
);

function MapControls({ 
  onToggleMapType, 
  mapType, 
  isMaximized, 
  onToggleMaximize 
}: { 
  onToggleMapType: () => void, 
  mapType: 'road' | 'satellite',
  isMaximized: boolean,
  onToggleMaximize: () => void
}) {
  const map = useMap();
  return (
    <div className="flex flex-col gap-3 pointer-events-auto items-end">
      <div className="bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        <button onClick={() => map.zoomIn()} className="p-3 hover:bg-slate-50 transition-colors text-slate-600 border-b border-slate-100 active:scale-90" aria-label="Zoom in"><Plus className="w-5 h-5" /></button>
        <button onClick={() => map.zoomOut()} className="p-3 hover:bg-slate-50 transition-colors text-slate-600 border-b border-slate-100 active:scale-90" aria-label="Zoom out"><Minus className="w-5 h-5" /></button>
        <button onClick={onToggleMaximize} className="p-3 hover:bg-slate-50 transition-colors text-slate-600 active:scale-90" aria-label="Toggle Gallery Visibility">
          {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>
      <button 
        onClick={onToggleMapType}
        className="p-3 bg-white/90 backdrop-blur border border-slate-200 rounded-2xl shadow-2xl hover:bg-slate-50 transition-all active:scale-90 flex items-center gap-2 text-slate-600"
      >
        {mapType === 'road' ? <Globe className="w-5 h-5 text-blue-600" /> : <MapIcon className="w-5 h-5 text-green-600" />}
      </button>
    </div>
  );
}

function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (isValidCoord(center[0]) && isValidCoord(center[1])) {
      map.flyTo(center, zoom, { duration: 3.0 });
    }
  }, [center, zoom, map]);
  return null;
}

function MapEventsHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

interface NavLocation {
  name: string;
  lat: number;
  lng: number;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([{
    id: '1', role: 'assistant', content: 'Welcome to GeoSlop. I have initiated a swarm capture to gather real-world photos for you. Where shall we go?', timestamp: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [focalLocation, setFocalLocation] = useState<UserLocation | undefined>(undefined);
  const [mapCenter, setMapCenter] = useState<[number, number]>([47.4517, -122.4631]); 
  const [mapZoom, setMapZoom] = useState<number>(10);
  const [currentLocationName, setCurrentLocationName] = useState<string>("Vashon Island");
  const [markers, setMarkers] = useState<LocationResult[]>([]);
  const [galleryImages, setGalleryImages] = useState<VisualLandmark[]>([]);
  const [activeRichCaption, setActiveRichCaption] = useState<VisualLandmark | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [suggestedAlternatives, setSuggestedAlternatives] = useState<string[]>([]);
  const [seenHistory, setSeenHistory] = useState<string[]>(["Vashon Island", "Petra"]);
  const [mapType, setMapType] = useState<'road' | 'satellite'>('satellite');
  const [isMaximized, setIsMaximized] = useState(false);
  
  const [navHistory, setNavHistory] = useState<NavLocation[]>([{ name: "Vashon Island", lat: 47.4517, lng: -122.4631 }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const geminiService = useRef(new GeminiService());
  const activeSessionId = useRef<number>(0);

  const updateGalleryAndQuestions = async (placeName: string) => {
    const sessionId = ++activeSessionId.current;
    setGalleryImages([]);
    setIsGalleryLoading(true);
    setSuggestedQuestions([]);
    
    try {
      // Fetch everything including web URLs in one go now that we aren't generating
      const [landmarks, questions] = await Promise.all([
        geminiService.current.getVisualKeywords(placeName),
        geminiService.current.getPertinentQuestions(placeName, 4)
      ]);

      if (sessionId !== activeSessionId.current) return;
      
      setSuggestedQuestions(questions);
      setGalleryImages(landmarks);
      
      if (scrollContainerRef.current) {
        setTimeout(() => { 
          scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' }); 
        }, 300);
      }
    } catch (e) {
      console.error("Gallery update failed", e);
    } finally {
      if (sessionId === activeSessionId.current) {
        setIsGalleryLoading(false);
      }
    }
  };

  useEffect(() => {
    updateGalleryAndQuestions("Vashon Island");
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, suggestedAlternatives]);

  const jumpTo = async (name: string, lat: number, lng: number, isNavigating: boolean = false) => {
    if (!isValidCoord(lat) || !isValidCoord(lng)) {
      console.warn(`Attempted warp to invalid coords: ${lat}, ${lng} for ${name}`);
      return;
    }

    // Immediate UI Feedback
    setCurrentLocationName(name);
    setSearchQuery(name); 
    setSuggestedAlternatives([]);
    setMapCenter([lat, lng]);
    setMapZoom(16);
    setFocalLocation({ latitude: lat, longitude: lng });
    setGalleryImages([]);
    
    // Deliver the message FIRST
    const warpingId = Date.now().toString();
    setMessages(prev => [...prev, { 
      id: warpingId, 
      role: 'assistant', 
      content: `Warping to ${name}...`, 
      timestamp: Date.now() 
    }]);

    setIsGalleryLoading(true);
    updateGalleryAndQuestions(name);
    setIsLoading(true);

    if (!isNavigating) {
      const newHistory = navHistory.slice(0, historyIndex + 1);
      newHistory.push({ name, lat, lng });
      setNavHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    try {
      const summary = await geminiService.current.getLocationSummary(name);
      setMessages(prev => prev.map(m => m.id === warpingId ? {
        ...m,
        content: `Warped to ${name}!\n\n${summary}`
      } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === warpingId ? {
        ...m,
        content: `Warped to ${name}! Ready to explore.`
      } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prev = navHistory[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      jumpTo(prev.name, prev.lat, prev.lng, true);
    }
  };

  const handleForward = () => {
    if (historyIndex < navHistory.length - 1) {
      const next = navHistory[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      jumpTo(next.name, next.lat, next.lng, true);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    if (isLoading || !isValidCoord(lat) || !isValidCoord(lng)) return;
    setIsLoading(true);
    try {
      const result = await geminiService.current.reverseGeocode(lat, lng);
      if (result && isValidCoord(result.lat) && isValidCoord(result.lng)) {
        await jumpTo(result.name, result.lat, result.lng);
      }
    } catch (e) {
      console.error("Reverse geocoding failed", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const query = (customQuery || searchQuery).trim();
    if (!query || isLoading) return;
    
    setIsLoading(true);
    setSuggestedAlternatives([]);

    try {
      const result = await geminiService.current.geocode(query);
      if (result && result.name && isValidCoord(result.lat) && isValidCoord(result.lng)) {
        await jumpTo(result.name, result.lat, result.lng);
      } else if (result && result.alternatives && result.alternatives.length > 0) {
        setSuggestedAlternatives(result.alternatives);
        setMessages(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'assistant', 
          content: `I couldn't find "${query}". Did you mean one of these?`, 
          timestamp: Date.now() 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'assistant', 
          content: `Sorry, I couldn't find "${query}". Try a different city.`, 
          timestamp: Date.now() 
        }]);
      }
    } catch (err) { 
      console.error("Search failed", err); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleSend = async (customInput?: string) => {
    const queryText = customInput || input;
    if (!queryText.trim() || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: queryText, timestamp: Date.now() }]);
    if (!customInput) setInput('');
    setIsLoading(true);
    try {
      const response = await geminiService.current.queryLocation(queryText, focalLocation);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text, timestamp: Date.now(), sources: response.sources, locationData: response.locationData }]);
      if (response.locationData) setMarkers(response.locationData);
    } catch (error) { console.error("Gemini query failed", error); } finally { setIsLoading(false); }
  };

  const handleReturnHome = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          jumpTo("Your Location", p.coords.latitude, p.coords.longitude);
        },
        (error) => {
          console.warn("Geolocation failed, returning to Vashon fallback", error);
          jumpTo("Vashon Island", 47.4517, -122.4631);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      jumpTo("Vashon Island", 47.4517, -122.4631);
    }
  };

  const handleFeelingLucky = async () => {
    if (isLoading) return;
    
    activeSessionId.current++;
    setGalleryImages([]);
    setSuggestedQuestions([]);
    setIsLoading(true);
    
    const loadingId = Date.now().toString();
    setMessages(prev => [...prev, { 
      id: loadingId, 
      role: 'assistant', 
      content: "Scouring the globe for something unique...", 
      timestamp: Date.now() 
    }]);

    try {
      const gem = await geminiService.current.getDynamicCoolLocation(seenHistory);
      setMessages(prev => prev.filter(m => m.id !== loadingId));

      if (gem && isValidCoord(gem.lat) && isValidCoord(gem.lng)) {
        setSeenHistory(prev => [...prev.slice(-20), gem.name]);
        await jumpTo(gem.name, gem.lat, gem.lng);
      } else {
        setIsLoading(false);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "I couldn't find a new spot right now. Let's try again.", timestamp: Date.now() }]);
      }
    } catch (err) {
      console.error("Failed to fetch dynamic location", err);
      setIsLoading(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Warp coordinates lost. Try searching manually!", timestamp: Date.now() }]);
    }
  };

  const handleImageClick = (item: VisualLandmark) => {
    setActiveRichCaption(item);
  };

  const scrollGallery = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 444; 
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleDiscoveryQuestion = async (question: string) => {
    handleSend(question);
    setSuggestedQuestions(prev => prev.filter(q => q !== question));
    try {
      const newQuestion = await geminiService.current.getSinglePertinentQuestion(currentLocationName, suggestedQuestions);
      if (newQuestion) {
        setSuggestedQuestions(prev => [...prev, newQuestion]);
      }
    } catch (e) {
      console.error("Failed to fetch replacement question", e);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900 font-sans">
      {/* Rich Caption Modal */}
      {activeRichCaption && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[in_0.3s_ease-out]">
          <div className="bg-white rounded-[32px] overflow-hidden shadow-2xl w-full max-w-lg border border-white/20 relative group">
            <button 
              onClick={() => setActiveRichCaption(null)}
              className="absolute top-4 right-4 z-20 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 relative">
              <img src={activeRichCaption.imageUrl} className="w-full h-full object-cover" alt={activeRichCaption.shortCaption} />
              {activeRichCaption.sourceUri && (
                <a 
                  href={activeRichCaption.sourceUri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/40 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-black/60 transition-all"
                >
                  <ExternalLink className="w-3 h-3" /> Web Source
                </a>
              )}
            </div>
            <div className="p-8">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 mb-2">Web Capture</h4>
              <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tighter leading-tight">{activeRichCaption.shortCaption}</h3>
              <p className="text-slate-600 font-medium leading-relaxed italic">{activeRichCaption.richCaption}</p>
              <div className="mt-6 pt-6 border-t border-slate-50 flex justify-end">
                <button 
                  onClick={() => setActiveRichCaption(null)}
                  className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white flex flex-col border-r border-slate-200 z-10 shadow-2xl overflow-hidden shrink-0">
        <header className="p-8 border-b border-slate-100 flex flex-col">
          <div className="flex items-center gap-5">
            <div className="bg-blue-600 p-4 rounded-[22px] shadow-xl shadow-blue-100"><MapPin className="w-8 h-8 text-white" /></div>
            <div className="flex-1 overflow-hidden">
              <h1 className="font-black text-3xl tracking-tighter text-slate-900 leading-none mb-1.5">GeoSlop</h1>
              <div className="flex flex-col">
                <p className="text-[11px] uppercase tracking-[0.25em] text-blue-600 font-black mb-1">Web Discovery</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl transition-all w-fit">
                  <Compass className="w-4 h-4 animate-spin-slow flex-shrink-0" />
                  <p className="text-sm font-black uppercase tracking-widest truncate max-w-[140px]">
                    {currentLocationName}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/20">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] p-5 rounded-[28px] shadow-sm border ${msg.role === 'user' ? 'bg-blue-600 border-blue-500 text-white rounded-br-none' : 'bg-white border-slate-200 text-slate-800 rounded-bl-none'}`}>
                <div className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</div>
              </div>
              <span className="text-[10px] text-slate-400 mt-2.5 font-black uppercase tracking-tighter">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          
          {suggestedAlternatives.length > 0 && (
            <div className="flex flex-wrap gap-3 animate-[in_0.3s_ease-out]">
              {suggestedAlternatives.map((alt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleLocationSearch(undefined, alt)}
                  className="px-6 py-3 bg-blue-50 border-2 border-blue-100 text-blue-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-90 shadow-sm"
                >
                  {alt}
                </button>
              ))}
            </div>
          )}

          {isLoading && <div className="flex items-center gap-3 text-blue-600 p-3 italic text-sm font-black animate-pulse"><Loader2 className="w-5 h-5 animate-spin" />Scouring the web...</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="p-8 border-t border-slate-100 bg-white">
          <div className="relative flex items-center gap-4">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              placeholder="Ask about this place..." 
              className="flex-1 p-6 bg-slate-50 rounded-[22px] border-2 border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white text-xl font-bold placeholder:text-slate-400 shadow-lg transition-all" 
            />
            <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="p-6 bg-blue-600 text-white rounded-[22px] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-xl active:scale-90"><Send className="w-7 h-7" /></button>
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative flex flex-col min-w-0">
        <div className="flex-1 relative w-full h-full min-h-0 bg-slate-100">
          <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full" scrollWheelZoom={true} zoomControl={false}>
            {mapType === 'road' ? (
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            ) : (
              <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            )}
            <MapUpdater center={mapCenter} zoom={mapZoom} />
            <MapEventsHandler onMapClick={handleMapClick} />
            
            <div className="absolute top-1/2 -translate-y-1/2 right-4 z-[1000] pointer-events-none">
              <MapControls 
                onToggleMapType={() => setMapType(mapType === 'road' ? 'satellite' : 'road')} 
                mapType={mapType} 
                isMaximized={isMaximized}
                onToggleMaximize={() => setIsMaximized(!isMaximized)}
              />
            </div>

            {markers.map((loc, idx) => (
              isValidCoord(loc.latitude) && isValidCoord(loc.longitude) ? (
                <Marker key={idx} position={[loc.latitude, loc.longitude]}>
                  <Popup><div className="p-2"><h3 className="font-black text-blue-700 text-base">{loc.title}</h3></div></Popup>
                </Marker>
              ) : null
            ))}
          </MapContainer>

          {/* Compact Control Panel */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-4xl px-4 pointer-events-none">
            <div className="bg-white/80 backdrop-blur-xl shadow-2xl rounded-[24px] border border-white/40 p-1 flex flex-row items-center gap-1 pointer-events-auto transition-transform active:scale-[0.995]">
              <div className="flex gap-1 pr-1 border-r border-slate-200/50">
                <button onClick={handleBack} disabled={historyIndex === 0} className="p-2 bg-slate-100/50 hover:bg-slate-200/80 rounded-full text-slate-600 disabled:opacity-30 transition-all active:scale-75" title="Back"><ArrowLeft className="w-4 h-4" /></button>
                <button onClick={handleForward} disabled={historyIndex === navHistory.length - 1} className="p-2 bg-slate-100/50 hover:bg-slate-200/80 rounded-full text-slate-600 disabled:opacity-30 transition-all active:scale-75" title="Forward"><ArrowRight className="w-4 h-4" /></button>
              </div>
              
              <form onSubmit={handleLocationSearch} className="flex-[10] flex items-center gap-1">
                <div className="relative flex-1 group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" /></div>
                  <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    placeholder="Warp to a new city..." 
                    className="block w-full h-11 pl-12 pr-10 text-lg font-bold text-slate-800 bg-slate-100/30 hover:bg-slate-100/50 focus:bg-white rounded-[18px] border border-transparent focus:border-blue-500/50 outline-none transition-all placeholder:text-slate-400 shadow-inner" 
                  />
                  {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 active:scale-90"><X className="w-4 h-4" /></button>}
                </div>
                <button type="submit" disabled={isLoading} className="px-6 h-11 bg-blue-600 text-white rounded-[18px] font-black text-xs uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 shadow-md">{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}</button>
              </form>
              
              <div className="w-px h-8 bg-slate-200/50 mx-1 hidden sm:block"></div>
              <button onClick={handleReturnHome} className="flex-1 h-11 bg-slate-800 text-white shadow-md rounded-[18px] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-700 transition-all active:scale-90" title="Home"><Home className="w-4 h-4" /></button>
              <button 
                onClick={handleFeelingLucky} 
                className="flex-[2.5] h-11 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md rounded-[18px] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:shadow-blue-200 transition-all active:scale-90 group border border-white/10" 
                disabled={isLoading}
                title="Next cool place"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
                <span className="hidden xl:inline">{isLoading ? 'Searching...' : 'Next cool place'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Gallery Section - Collapsible */}
        {!isMaximized && (
          <div className="h-[360px] bg-white border-t-2 border-slate-100 flex flex-col overflow-hidden shrink-0 relative group/gallery transition-all duration-300">
            <div className="px-8 py-4 flex items-center justify-between border-b-2 border-slate-50 shrink-0">
              <div className="flex-1 flex items-center gap-6 overflow-hidden pr-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl"><ImageIcon className="w-6 h-6 text-blue-600" /></div>
                  <h3 className="text-slate-900 text-sm font-black uppercase tracking-[0.2em] whitespace-nowrap">Web Swarm</h3>
                </div>
                <div className="hidden md:flex flex-1 items-center gap-3 overflow-x-auto no-scrollbar py-1">
                  {suggestedQuestions.map((q, idx) => (
                    <button key={idx} onClick={() => handleDiscoveryQuestion(q)} disabled={isLoading} className="flex-shrink-0 px-6 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold text-slate-600 hover:bg-blue-50 hover:border-blue-200 transition-all active:scale-90 disabled:opacity-50 shadow-sm animate-[in_0.3s_ease-out]">{q}</button>
                  ))}
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-black uppercase tracking-[0.15em] hidden sm:block italic">Live Web Discovery</span>
            </div>
            
            <div className="relative flex-1 overflow-hidden">
              <button onClick={() => scrollGallery('left')} className="absolute left-6 top-1/2 -translate-y-1/2 z-20 p-4 bg-white/95 border border-slate-200 rounded-3xl shadow-xl hover:bg-white active:scale-75 transition-all opacity-0 group-hover/gallery:opacity-100 hidden sm:block"><ChevronLeft className="w-6 h-6 text-slate-700" /></button>
              <button onClick={() => scrollGallery('right')} className="absolute right-6 top-1/2 -translate-y-1/2 z-20 p-4 bg-white/95 border border-slate-200 rounded-3xl shadow-xl hover:bg-white active:scale-75 transition-all opacity-0 group-hover/gallery:opacity-100 hidden sm:block"><ChevronRight className="w-6 h-6 text-slate-700" /></button>

              <div ref={scrollContainerRef} className="h-full overflow-x-auto px-8 py-6 flex gap-6 items-center custom-scrollbar select-none" style={{ scrollSnapType: 'x mandatory' }}>
                {isGalleryLoading ? (
                  <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 max-w-5xl mx-auto">
                    <div className="relative w-64 h-64 shrink-0 flex items-center justify-center">
                      <div className="absolute inset-0 bg-blue-400/5 rounded-full animate-ping scale-110"></div>
                      <EyeDrone className="relative w-56 h-56 animate-[swarm_4s_infinite] drop-shadow-2xl" />
                    </div>
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                      <div className="flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-lg mb-4">
                        <Globe className="w-3 h-3 fill-white animate-pulse" /> Web Search Engaged
                      </div>
                      <h2 className="text-4xl font-black text-slate-900 leading-none mb-2 tracking-tighter">Locating <span className="text-blue-600">{currentLocationName}</span></h2>
                      <div className="w-full max-w-xs h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div className="h-full bg-blue-600 transition-all duration-300 animate-[loading_2.5s_infinite]" style={{ width: '45%' }}></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {galleryImages.map((img, idx) => (
                      <div key={idx} onClick={() => handleImageClick(img)} className="flex-none w-[440px] h-[220px] rounded-[32px] overflow-hidden shadow-2xl border-2 border-white group relative bg-slate-100 transition-all duration-700 animate-[in_0.5s_ease-out] cursor-pointer active:scale-95" style={{ scrollSnapAlign: 'start' }}>
                        <img src={img.imageUrl} alt={img.shortCaption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[3000ms]" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent flex flex-col justify-end p-6 z-10">
                          <span className="text-xs text-white font-black uppercase tracking-widest">{img.shortCaption}</span>
                          {img.sourceUri && (
                            <span className="text-[8px] text-white/60 font-black uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
                              <Globe className="w-2 h-2" /> Web Find
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {!isGalleryLoading && galleryImages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-slate-300 font-black uppercase tracking-[0.4em] text-xs italic">Web Signal Offline</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes in { from { opacity: 0; transform: scale(0.95) translateX(20px); } to { opacity: 1; transform: scale(1) translateX(0); } }
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        @keyframes swarm {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(15px, -10px) rotate(5deg); }
          50% { transform: translate(-10px, 15px) rotate(-5deg); }
          75% { transform: translate(-15px, -5px) rotate(3deg); }
        }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 20s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; margin: 0 40px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; border: 2px solid white; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        button:focus-visible { outline: 3px solid #3b82f6; outline-offset: 2px; }
      `}</style>
    </div>
  );
};

export default App;
