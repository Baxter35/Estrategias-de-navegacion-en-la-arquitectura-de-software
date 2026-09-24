/** Cola de prioridad binaria (min-heap). Base de Dijkstra, A* y la búsqueda bidireccional. */
export class MinHeap<T> {
  private items: { key: number; value: T }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: T, key: number): void {
    this.items.push({ key, value });
    this.bubbleUp(this.items.length - 1);
  }

  peekKey(): number {
    return this.items.length ? this.items[0].key : Infinity;
  }

  pop(): { key: number; value: T } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    const a = this.items;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  private sinkDown(i: number): void {
    const a = this.items;
    const n = a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && a[l].key < a[m].key) m = l;
      if (r < n && a[r].key < a[m].key) m = r;
      if (m === i) return;
      [a[m], a[i]] = [a[i], a[m]];
      i = m;
    }
  }
}
