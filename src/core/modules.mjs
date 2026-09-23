/** Small synchronous lifecycle registry; reserved entries are documentation, never mounted. */
export class ModuleRegistry {
  #definitions = new Map();
  #running = new Map();
  register(definition) {
    if (!definition || typeof definition.id !== 'string' || !definition.id.trim() || definition.apiVersion !== 1) {
      throw new TypeError('Invalid module definition');
    }
    if (!['available', 'reserved'].includes(definition.status)) throw new TypeError('Invalid module status');
    if (definition.status === 'available' && typeof definition.activate !== 'function') throw new TypeError('Missing activate');
    if (this.#definitions.has(definition.id)) throw new Error(`Duplicate module: ${definition.id}`);
    this.#definitions.set(definition.id, { ...definition });
  }
  list() {
    return [...this.#definitions.values()].map(({ id, apiVersion, status, title }) =>
      ({ id, apiVersion, status, title, active: this.#running.has(id) }));
  }
  enable(id, services) {
    if (this.#running.has(id)) return;
    const module = this.#definitions.get(id);
    if (!module || module.status !== 'available') throw new Error(`Module unavailable: ${id}`);
    const dispose = module.activate(services);
    if (typeof dispose !== 'function') throw new TypeError('activate must return a synchronous disposer');
    this.#running.set(id, dispose);
  }
  disable(id) {
    const dispose = this.#running.get(id);
    if (!dispose) return;
    this.#running.delete(id);
    dispose();
  }
  dispose() {
    const errors = [];
    for (const id of [...this.#running.keys()].reverse()) {
      try { this.disable(id); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Module cleanup failed');
  }
}
