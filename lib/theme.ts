export type ColorScheme = {
  background: string;
  text: string;
  secondaryText: string;
  primary: string;
  secondary: string;
  accent: string;
};

const lightSchemes: ColorScheme[] = [
  {
    background: "#F0E5D8",
    text: "#3E3E3E",
    secondaryText: "#A1A1A1",
    primary: "#F1A7B5",
    secondary: "#A7B8B5",
    accent: "#F9D4C1",
  },
  {
    background: "#E7ECEF",
    text: "#2D3A3F",
    secondaryText: "#8A8D8F",
    primary: "#A4C6E1",
    secondary: "#FFB6B9",
    accent: "#B8E0D2",
  },
  {
    background: "#F9F5F0",
    text: "#4A4A4A",
    secondaryText: "#B0B0B0",
    primary: "#B5A5D6",
    secondary: "#F3C6A0",
    accent: "#F2D3C4",
  },
];

const darkSchemes: ColorScheme[] = [
  {
    background: "#4B4A58",
    text: "#E3E4E8",
    secondaryText: "#A1A1A1",
    primary: "#6F6B7F",
    secondary: "#D19AAB",
    accent: "#7C6F7D",
  },
  {
    background: "#2C3A47",
    text: "#F6F5F5",
    secondaryText: "#A8A8A8",
    primary: "#8F7D9B",
    secondary: "#F1A7B5",
    accent: "#2E3548",
  },
  {
    background: "#1F2A44",
    text: "#D5D7E1",
    secondaryText: "#7C7C7C",
    primary: "#E5A1C1",
    secondary: "#5B5F75",
    accent: "#D9AAB5",
  },
];

export const getRandomScheme = (): ColorScheme => {
  const allSchemes = [...lightSchemes, ...darkSchemes];
  return allSchemes[Math.floor(Math.random() * allSchemes.length)];
};
