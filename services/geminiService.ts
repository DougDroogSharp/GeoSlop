
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
  imageUrl: string;
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

  async getVisualKeywords(placeName: string, exclude: string[] = []): Promise<VisualLandmark[]> {
    const model = 'gemini-3-flash-preview';
    const exclusionPrompt = exclude.length > 0 ? ` Do NOT include any of these: ${exclude.join(', ')}.` : '';
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Use Google Search to find 4 REAL, specific, and iconic visual landmarks strictly within "${placeName}". ${exclusionPrompt}
          
          MANDATORY INSTRUCTIONS FOR IMAGE URLS:
          1. "imageUrl" MUST be a direct hotlink to the ACTUAL IMAGE FILE (ends in .jpg, .jpeg, .png, or .webp).
          2. IMPORTANT: If using Wikimedia Commons, DO NOT use the "File:" page URL (e.g., commons.wikimedia.org/wiki/File:...). 
             Instead, find the DIRECT THUMBNAIL URL (e.g., https://upload.wikimedia.org/wikipedia/commons/thumb/...).
          3. If using Unsplash, use the direct image link (e.g., https://images.unsplash.com/photo-...).
          4. "sourceUri": The human-readable web page where the photo is found.
          5. "shortCaption": 3-5 bold words.
          6. "richCaption": 2-sentence poetic description of the visual scene.
          
          Return ONLY a JSON array. Be extremely accurate; your goal is to find direct embeddable links that show the actual location.`,
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
                required: ["shortCaption", "richCaption", "imageUrl", "sourceUri"]
              }
            }
          }
        });
        return JSON.parse(response.text || "[]");
      });
    } catch (e) {
      console.error("Discovery failed", e);
      return [];
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
    const exclusionText = exclude.length > 0 ? ` DO NOT suggest any of these places: ${exclude.join(', ')}.` : "";
    try {
      return await this.withRetry(async () => {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model,
          contents: `Suggest one obscure, fascinating, and visually stunning hidden gem location on Earth. 
          Avoid famous tourist traps like Petra, the Grand Canyon, or the Eiffel Tower. 
          Focus on weird geography, ancient ruins, or remote natural wonders.
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
