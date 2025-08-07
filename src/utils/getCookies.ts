const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  
  if (parts.length === 2) {
    const lastPart = parts.pop();
    if (lastPart) {
      return lastPart.split(';')[0];
    }
    return null;
  }
  
  return null;
};

export { getCookie };
