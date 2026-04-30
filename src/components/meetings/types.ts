import type React from "react";

export interface L10Section {
  key: string;
  label: string;
  duration: number; // minutes
  icon: React.ElementType;
  color: string;
}
