import React, { createContext, useContext } from 'react';
// Using sonner (recommended modern toast lib)
import { Toaster, toast } from 'sonner';

interface ToastContextProps {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

// 📝 Export ToastContext so it can be imported elsewhere if needed
export const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const show = (type: 'success' | 'error' | 'info', message: string) => {
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'info':
      default:
        toast(message);
        break;
    }
  };

  const value: ToastContextProps = {
    success: (msg) => show('success', msg),
    error: (msg) => show('error', msg),
    info: (msg) => show('info', msg),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Mount the sonner toaster component */}
      <Toaster
        position="top-right"
        richColors
        expand
        duration={4000}
      />
    </ToastContext.Provider>
  );
};

/**
 * Custom hook to consume the ToastContext
 * Ensures it is used within a ToastProvider
 */
export const useToast = (): ToastContextProps => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
