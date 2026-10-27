import type { Housebook } from './lib/server/core/index';

declare global {
	namespace App {
		interface Locals {
			housebook: Housebook;
		}
	}
}

export {};
