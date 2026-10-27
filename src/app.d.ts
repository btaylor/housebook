import type { Housebook, Member } from './lib/server/core/index';

declare global {
	namespace App {
		interface Locals {
			housebook: Housebook;
			member: Member | null;
		}
	}
}

export {};
