import React, { createContext, useContext } from 'react';

export const Layer2HeaderContext = createContext<HTMLElement | null>(null);

export const useLayer2HeaderNode = (): HTMLElement | null => {
  return useContext(Layer2HeaderContext);
};
