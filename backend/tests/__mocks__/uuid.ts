// Mock uuid module for Jest tests
let counter = 0;

export const v4 = (): string => {
  counter++;
  return `test-uuid-${counter}-${Date.now()}`;
};

export const validate = (_uuid: string): boolean => {
  return typeof _uuid === 'string' && _uuid.length > 0;
};

export const version = (_uuid: string): number => {
  return 4;
};

export default { v4, validate, version };
