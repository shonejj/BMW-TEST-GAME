import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import type { LayoutDef } from './types';

/** Map layouts by chapter index (CHAPTERS[i] plays on LAYOUTS[i]). */
export const LAYOUTS: LayoutDef[] = [CH1, CH2, CH3];
