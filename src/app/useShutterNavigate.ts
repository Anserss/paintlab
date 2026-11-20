import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';
import { shutter } from './motion';

/**
 * 同源换页统一走快门（360ms）。
 * 浏览器不支持 View Transitions 或系统要求减少动效时，直接切页。
 */
export function useShutterNavigate(): (to: string, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: string, options?: NavigateOptions) => {
      shutter(() => navigate(to, options));
    },
    [navigate],
  );
}
