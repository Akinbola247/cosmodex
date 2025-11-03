// Pinata IPFS upload functionality

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  admin_addr: string;
  decimals: number;
  total_supply: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface UploadResult {
  success: boolean;
  imageUrl?: string;
  metadataUrl?: string;
  error?: string;
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Please upload PNG, JPG, GIF, or WebP.' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'File too large. Maximum size is 10MB.' };
  }

  return { valid: true };
}

export async function uploadTokenToPinata(
  imageFile: File,
  metadata: TokenMetadata
): Promise<UploadResult> {
  try {
    // Get JWT from environment variable
    const PINATA_JWT = import.meta.env.PUBLIC_PINATA_JWT as string | undefined;
    const GATEWAY_URL = (import.meta.env.PUBLIC_PINATA_GATEWAY as string | undefined) || "gateway.pinata.cloud";
    
    if (!PINATA_JWT) {
      throw new Error(
        "Pinata JWT not configured. Please add PUBLIC_PINATA_JWT to your .env file."
      );
    }

    // 1. Upload image to Pinata
    const imageFormData = new FormData();
    imageFormData.append('file', imageFile);

    const imageMetadata = JSON.stringify({
      name: `${metadata.symbol}-logo`,
    });
    imageFormData.append('pinataMetadata', imageMetadata);

    const imageOptions = JSON.stringify({
      cidVersion: 1,
    });
    imageFormData.append('pinataOptions', imageOptions);

    const imageUploadResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: imageFormData,
    });

    if (!imageUploadResponse.ok) {
      const errorText = await imageUploadResponse.text();
      console.error("Pinata API error:", errorText);
      throw new Error(`Image upload failed: ${imageUploadResponse.statusText}`);
    }

    const imageData = await imageUploadResponse.json() as { IpfsHash: string };
    const imageUrl = `https://${GATEWAY_URL}/ipfs/${imageData.IpfsHash}`;

    // 2. Create and upload metadata JSON
    const tokenMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      image: imageUrl,
      attributes: {
        admin_addr: metadata.admin_addr,
        decimals: metadata.decimals,
        total_supply: metadata.total_supply,
        website: metadata.website || "",
        twitter: metadata.twitter || "",
        telegram: metadata.telegram || "",
        created_at: new Date().toISOString(),
      },
    };

    const metadataBlob = new Blob([JSON.stringify(tokenMetadata)], { type: 'application/json' });
    const metadataFormData = new FormData();
    metadataFormData.append('file', metadataBlob, `${metadata.symbol}-metadata.json`);

    const metadataOptions = JSON.stringify({
      cidVersion: 1,
    });
    metadataFormData.append('pinataOptions', metadataOptions);

    const metadataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: metadataFormData,
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error("Pinata API error:", errorText);
      throw new Error(`Metadata upload failed: ${metadataResponse.statusText}`);
    }

    const metadataData = await metadataResponse.json() as { IpfsHash: string };
    const metadataUrl = `https://${GATEWAY_URL}/ipfs/${metadataData.IpfsHash}`;

    return {
      success: true,
      imageUrl,
      metadataUrl,
    };
  } catch (error) {
    console.error('Pinata upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

