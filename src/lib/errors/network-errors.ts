import { VibelogError } from '../../utils/errors.js';

export type NetworkErrorType = 
  | 'DNS_RESOLUTION_FAILED'
  | 'CONNECTION_REFUSED' 
  | 'TIMEOUT'
  | 'CONNECTION_RESET'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_NETWORK_ERROR';

export interface NetworkErrorInfo {
  type: NetworkErrorType;
  message: string;
  code: string;
  originalError?: any;
}

/**
 * Detects if an error is network-related
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  // Check error codes
  const networkErrorCodes = [
    'ENOTFOUND',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'ECONNABORTED',
    'ECONNRESET',
    'TIMEOUT'
  ];
  
  if (error.code && networkErrorCodes.includes(error.code)) {
    return true;
  }
  
  // Check error messages for network-related strings
  if (error.message) {
    const message = error.message.toLowerCase();
    return networkErrorCodes.some(code => message.includes(code.toLowerCase()));
  }
  
  // Check HTTP status codes
  if (error.response?.status) {
    const status = error.response.status;
    return status === 502 || status === 503 || status === 504;
  }
  
  return false;
}

/**
 * Gets the type of network error
 */
export function getNetworkErrorType(error: any): NetworkErrorType {
  if (!error) return 'UNKNOWN_NETWORK_ERROR';
  
  // Check specific error codes
  if (error.code === 'ENOTFOUND' || 
      (error.message && error.message.includes('ENOTFOUND'))) {
    return 'DNS_RESOLUTION_FAILED';
  }
  
  if (error.code === 'ECONNREFUSED' || 
      (error.message && error.message.includes('ECONNREFUSED'))) {
    return 'CONNECTION_REFUSED';
  }
  
  if (error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNABORTED' || 
      error.code === 'TIMEOUT' ||
      (error.message && (
        error.message.includes('ETIMEDOUT') || 
        error.message.includes('TIMEOUT')
      ))) {
    return 'TIMEOUT';
  }
  
  if (error.code === 'ECONNRESET' || 
      (error.message && error.message.includes('ECONNRESET'))) {
    return 'CONNECTION_RESET';
  }
  
  // Check HTTP status codes
  if (error.response?.status === 502 || 
      error.response?.status === 503 || 
      error.response?.status === 504) {
    return 'SERVICE_UNAVAILABLE';
  }
  
  return 'UNKNOWN_NETWORK_ERROR';
}

/**
 * Gets a user-friendly error message for network errors
 */
export function getNetworkErrorMessage(error: any): string {
  const errorType = getNetworkErrorType(error);
  
  switch (errorType) {
    case 'DNS_RESOLUTION_FAILED':
      return 'Cannot reach vibe-log servers. Please check your internet connection';
      
    case 'CONNECTION_REFUSED':
      return 'Connection refused. The server might be down or your firewall is blocking the connection';
      
    case 'TIMEOUT':
      return 'Request timed out. Your connection might be slow or the server is not responding';
      
    case 'CONNECTION_RESET':
      return 'Connection was reset. Please try again';
      
    case 'SERVICE_UNAVAILABLE':
      return 'Service temporarily unavailable. Please try again in a few moments';
      
    default:
      return 'Network error. Please check your internet connection and try again';
  }
}

/**
 * Gets a standardized error code for network errors
 */
export function getNetworkErrorCode(error: any): string {
  const errorType = getNetworkErrorType(error);
  
  switch (errorType) {
    case 'DNS_RESOLUTION_FAILED':
      return 'NETWORK_ERROR';
      
    case 'CONNECTION_REFUSED':
      return 'CONNECTION_REFUSED';
      
    case 'TIMEOUT':
      return 'TIMEOUT';
      
    case 'CONNECTION_RESET':
      return 'CONNECTION_RESET';
      
    case 'SERVICE_UNAVAILABLE':
      return 'SERVICE_UNAVAILABLE';
      
    default:
      return 'NETWORK_ERROR';
  }
}

/**
 * Creates a VibelogError from a network error
 */
export function createNetworkError(error: any): VibelogError {
  const message = getNetworkErrorMessage(error);
  const code = getNetworkErrorCode(error);
  return new VibelogError(message, code);
}

/**
 * Gets detailed network error information
 */
export function getNetworkErrorInfo(error: any): NetworkErrorInfo {
  return {
    type: getNetworkErrorType(error),
    message: getNetworkErrorMessage(error),
    code: getNetworkErrorCode(error),
    originalError: error
  };
}