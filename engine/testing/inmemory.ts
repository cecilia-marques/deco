import { Resolvable } from "../../engine/core/resolver.ts";
import { ReadOptions, Release } from "../../engine/releases/provider.ts";
import { OnChangeCallback } from "../releases/provider.ts";

export class InMemoryRelease implements Release {
  protected callbacks: OnChangeCallback[];
  protected currentRevision: number;
  protected _state: Record<string, Resolvable>;
  constructor(initial: Record<string, Resolvable> = {}) {
    this.callbacks = [];
    this.currentRevision = 0;
    this._state = initial;
  }

  set(state: Record<string, Resolvable>) {
    this._state = state;
    this.currentRevision++;
    for (const cb of this.callbacks) {
      cb();
    }
  }

  with(state: Record<string, Resolvable>) {
    this.set({ ...this._state, ...state });
  }

  state(
    _options?: ReadOptions | undefined,
  ): Promise<Record<string, Resolvable>> {
    return Promise.resolve(this._state);
  }
  archived(
    _options?: ReadOptions | undefined,
  ): Promise<Record<string, Resolvable>> {
    return Promise.resolve({});
  }
  revision(): Promise<string> {
    return Promise.resolve(`${this.currentRevision}`);
  }
  onChange(callback: OnChangeCallback): void {
    this.callbacks.push(callback);
  }
}
