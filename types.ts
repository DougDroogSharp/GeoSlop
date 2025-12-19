
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: GroundingSource[];
  locationData?: LocationResult[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface LocationResult {
  title: string;
  uri: string;
  latitude?: number;
  longitude?: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
