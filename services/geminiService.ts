
// Follows @google/genai coding guidelines:
// - Initializing GoogleGenAI with named parameter using process.env.API_KEY directly.
// - Using ai.models.generateContent with appropriate model names.
// - Accessing the .text property on GenerateContentResponse.
// - Using Type from @google/genai for JSON response schemas.

import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GroundingSource, LocationResult, UserLocation } from "../types";

export interface VisualLandmark {
  shortCaption: string;
  richCaption: string;
  searchTags: string;
  imageUrl?: string;
  sourceUri?: string;
}

export interface GeocodeResponse {
  name?: string;
  lat?: number;
  lng?: number;
  alternatives?: string[];
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 4, baseDelay = 3000): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const isRateLimited = error?.message?.includes('429') || error?.status === 429;
        const isServerError = error?.status >= 500 && error?.status <= 504;
        
        if ((isRateLimited || isServerError) && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(3, attempt) + Math.random() * 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }
    throw lastError;
  }

  async geocode(query: string): Promise<GeocodeResponse | null> {
    const model = 'gemini-3-flash-preview';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Search for the location "${query}". 
          If found, return the canonical name, lat, and lng. 
          If NOT found or the spelling is very ambiguous, return an array of 3 alternatives with similar names or likely intended locations.
          Return ONLY a JSON object.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER },
                alternatives: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING } 
                }
              }
            }
          }
        });
        return JSON.parse(response.text || "null");
      });
    } catch (e) {
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ name: string; lat: number; lng: number } | null> {
    const model = 'gemini-3-flash-preview';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `What is the nearest significant city or interesting landmark to the coordinates ${lat}, ${lng}? 
          Return ONLY a JSON object with keys "name" (the canonical name), "lat", and "lng".`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              },
              required: ["name", "lat", "lng"]
            }
          }
        });
        return JSON.parse(response.text || "null");
      });
    } catch (e) {
      return null;
    }
  }

  async getLocationSummary(placeName: string): Promise<string> {
    const model = 'gemini-3-flash-preview';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Provide a captivating 40-word paragraph describing the unique history, geography, and significance of "${placeName}". Make it sound like a premium travel guide.`,
        });
        return response.text?.trim() || `Welcome to ${placeName}!`;
      });
    } catch (e) {
      return `Welcome to ${placeName}!`;
    }
  }

  /**
   * INSTEAD OF GENERATING, we use Google Search to find real web photos.
   * We prompt the model to find specific URLs.
   */
  async getVisualKeywords(placeName: string, exclude: string[] = []): Promise<VisualLandmark[]> {
    const model = 'gemini-3-flash-preview';
    const exclusionPrompt = exclude.length > 0 ? ` Do NOT include any of these: ${exclude.join(', ')}.` : '';
    
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Using Google Search, find 4 real, specific visual landmarks or unique perspectives strictly within "${placeName}".
          For each landmark, you must find:
          1. A real, direct public image URL (e.g., from Wikimedia Commons, Pixabay, or official tourism sites). 
          2. The web page URL where this image is located.
          3. A "shortCaption": 5-6 words max.
          4. A "richCaption": 2-sentence poetic description.
          
          Return as a JSON array. If you cannot find a direct image URL, use a high-quality placeholder like 'https://images.unsplash.com/photo-[id]?auto=format&fit=crop&w=800&q=80' that corresponds to the landmark type.
          
          ${exclusionPrompt}`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shortCaption: { type: Type.STRING },
                  richCaption: { type: Type.STRING },
                  imageUrl: { type: Type.STRING },
                  sourceUri: { type: Type.STRING }
                },
                required: ["shortCaption", "richCaption", "imageUrl"]
              }
            }
          }
        });
        return JSON.parse(response.text || "[]");
      });
    } catch (e) {
      console.error("Failed to gather web photos", e);
      return [
        { 
          shortCaption: "Explore the City", 
          richCaption: "The vibrant pulse of the streets comes alive under the golden hour sun.", 
          imageUrl: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80",
          sourceUri: "https://unsplash.com"
        },
      ];
    }
  }

  async getPertinentQuestions(placeName: string, count: number = 3): Promise<string[]> {
    const model = 'gemini-3-flash-preview';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Provide ${count} short, intriguing questions (under 45 chars) about the history, culture, or geography of "${placeName}". Return as a JSON array of strings.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        });
        return JSON.parse(response.text || "[]");
      });
    } catch (e) {
      return ["Tell me a secret about this place.", "What's the oldest building here?"];
    }
  }

  async getSinglePertinentQuestion(placeName: string, exclude: string[]): Promise<string | null> {
    const model = 'gemini-3-flash-preview';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Provide exactly one short, intriguing question (under 45 chars) about the history, culture, or geography of "${placeName}". Do NOT include any of the following: ${exclude.join(', ')}. Return only the question text.`,
        });
        return response.text?.trim() || null;
      });
    } catch (e) {
      return null;
    }
  }

  async getDynamicCoolLocation(exclude: string[]): Promise<{ name: string; lat: number; lng: number } | null> {
    const model = 'gemini-3-flash-preview';
    const forbidden = ["Petra", "Grand Canyon", "Eiffel Tower", "Machu Picchu", "Pyramids of Giza", "Great Wall of China", "Statue of Liberty", "Sydney Opera House", "Vatican City"];
    const allExclude = Array.from(new Set([...exclude, ...forbidden]));
    const exclusionText = allExclude.length > 0 ? ` STRICTLY FORBIDDEN locations: ${allExclude.join(', ')}.` : "";
    
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Suggest one truly obscure, fascinating, and visually stunning hidden gem location on Earth. 
          Think: bizarre geological formations, abandoned ancient cities, remote monasteries, or psychedelic natural wonders.
          The goal is high variety and high "cool" factor. Avoid anything famous or typical.
          ${exclusionText}
          Return ONLY a JSON object with keys "name", "lat", and "lng".`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              },
              required: ["name", "lat", "lng"]
            }
          }
        });
        return JSON.parse(response.text || "null");
      });
    } catch (e) {
      return null;
    }
  }

  async queryLocation(prompt: string, userLocation?: UserLocation) {
    const model = 'gemini-2.5-flash';
    const config: any = {
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      temperature: 0.7,
    };

    if (userLocation) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude
          }
        }
      };
    }

    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        const text = response.text || "I couldn't find any information.";
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        const sources: GroundingSource[] = [];
        const locationData: LocationResult[] = [];

        chunks.forEach((chunk: any) => {
          if (chunk.maps) {
            locationData.push({ title: chunk.maps.title, uri: chunk.maps.uri });
            sources.push({ title: chunk.maps.title, uri: chunk.maps.uri });
          } else if (chunk.web) {
            sources.push({ title: chunk.web.title, uri: chunk.web.uri });
          }
        });

        return { text, sources, locationData };
      });
    } catch (error) {
      throw error;
    }
  }
}
