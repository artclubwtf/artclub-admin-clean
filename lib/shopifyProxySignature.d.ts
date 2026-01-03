export function buildShopifyProxySignatureMessage(params: URLSearchParams): string;
export function getShopifyProxyProvidedSignature(params: URLSearchParams): string | null;
export function compareShopifyProxySignatures(expected: string, provided: string): boolean;
export function computeShopifyProxySignatureFromMessage(message: string, secret: string): string;
export function computeShopifyProxySignature(params: URLSearchParams, secret: string): string;
export function verifyShopifyProxySignature(params: URLSearchParams, secret: string): boolean;
