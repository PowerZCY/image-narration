/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ShareUrls {
  protected: {
    view: string;
    download: string;
  };
  public: {
    view: string;
    download: string;
    expires_at: string;
    expires_in_hours: number;
    is_long_term: boolean;
  };
}

export interface UploadResult {
  success: boolean;
  file: {
    originalFilename: string;
    storedFilename: string;
    conflictPrevented: boolean;
  };
  share_urls: ShareUrls;
}

export interface FileMetadata {
  filename: string;
  size: number;
  contentType: string;
  lastModified: string;
  etag: string;
  customMetadata?: Record<string, string>;
}

export interface FileItem {
  name: string;
  size: number;
  lastModified: string;
  etag: string;
  displayName?: string;
  isVersioned: boolean;
}

interface R2Client {
  upload: (filename: string, file: File | Blob | ArrayBuffer | string, contentType?: string) => Promise<UploadResult>;
  list: (prefix?: string, limit?: number) => Promise<FileItem[]>;
  share: (filename: string, expiresIn?: number) => Promise<ShareUrls>;
  metadata: (filename: string) => Promise<FileMetadata>;
  download: (filename: string) => Promise<Blob>;
  getUrl: (filename: string, forceDownload?: boolean) => string;
}

/**
 * Create R2 Explorer client for a specific bucket
 */
export function createR2Client(config: {
  baseUrl: string;
  bucketName: string;
  apiToken: string;
}): R2Client {
  const { baseUrl, bucketName, apiToken } = config;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  const request = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = `${cleanBaseUrl}/api/buckets/${bucketName}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || `HTTP ${response.status}`;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }
      
      throw new Error(`API Error: ${errorMessage}`);
    }

    return response.json();
  };

  return {
    async upload(filename: string, file: File | Blob | ArrayBuffer | string, contentType?: string): Promise<UploadResult> {
      const url = `${cleanBaseUrl}/api/buckets/${bucketName}/${encodeURIComponent(filename)}`;
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': contentType || (file instanceof File ? file.type : 'application/octet-stream')
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return response.json();
    },

    async list(prefix?: string, limit?: number): Promise<FileItem[]> {
      const url = new URL(`${cleanBaseUrl}/api/buckets/${bucketName}/files`);
      if (prefix) url.searchParams.set('prefix', prefix);
      if (limit) url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`List failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.files;
    },

    async share(filename: string, expiresIn?: number): Promise<ShareUrls> {
      const body: any = { filename };
      if (expiresIn) body.expires_in = expiresIn;

      const result = await request<{ data: ShareUrls }>('/share', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      return result.data;
    },

    async metadata(filename: string): Promise<FileMetadata> {
      const result = await request<{ metadata: FileMetadata }>('/metadata', {
        method: 'POST',
        body: JSON.stringify({ filename })
      });

      return result.metadata;
    },

    async download(filename: string): Promise<Blob> {
      const url = `${cleanBaseUrl}/api/buckets/${bucketName}/${encodeURIComponent(filename)}?download=true`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      return response.blob();
    },

    getUrl(filename: string, forceDownload: boolean = false): string {
      const url = `${cleanBaseUrl}/api/buckets/${bucketName}/${encodeURIComponent(filename)}`;
      return forceDownload ? `${url}?download=true` : url;
    }
  };
}