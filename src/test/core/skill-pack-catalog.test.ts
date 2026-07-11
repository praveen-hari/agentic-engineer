import { describe, it, expect } from 'vitest';
import { SkillPackCatalog } from '../../core/skill-pack-catalog';

describe('SkillPackCatalog', () => {
  const catalog = new SkillPackCatalog();

  describe('getAll', () => {
    it('returns all 14 skill packs', () => {
      const packs = catalog.getAll();
      expect(packs).toHaveLength(14);
    });

    it('every pack has required metadata', () => {
      const packs = catalog.getAll();
      for (const pack of packs) {
        expect(pack.id).toBeDefined();
        expect(pack.name).toBeDefined();
        expect(pack.platform).toBeDefined();
        expect(pack.category).toBeDefined();
        expect(pack.repo).toBeDefined();
        expect(pack.skillCount).toBeGreaterThan(0);
        expect(pack.representativeComponents.length).toBeGreaterThan(0);
      }
    });

    it('every pack has a unique id', () => {
      const packs = catalog.getAll();
      const ids = packs.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('getByCategory', () => {
    it('returns 5 Web packs', () => {
      const packs = catalog.getByCategory('Web');
      expect(packs).toHaveLength(5);
    });

    it('returns 5 .NET packs', () => {
      const packs = catalog.getByCategory('.NET');
      expect(packs).toHaveLength(5);
    });

    it('returns 4 Document packs', () => {
      const packs = catalog.getByCategory('Document');
      expect(packs).toHaveLength(4);
    });
  });

  describe('getByPlatform', () => {
    it('returns the React pack', () => {
      const packs = catalog.getByPlatform('React');
      expect(packs).toHaveLength(1);
      expect(packs[0].name).toContain('React');
    });

    it('returns the Blazor pack', () => {
      const packs = catalog.getByPlatform('Blazor');
      expect(packs).toHaveLength(1);
      expect(packs[0].platform).toBe('Blazor');
    });

    it('returns empty array for unknown platform', () => {
      const packs = catalog.getByPlatform('Nonexistent');
      expect(packs).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns the correct pack for a known id', () => {
      const pack = catalog.getById('react-ui-components');
      expect(pack).toBeDefined();
      expect(pack!.platform).toBe('React');
    });

    it('returns undefined for an unknown id', () => {
      const pack = catalog.getById('nonexistent');
      expect(pack).toBeUndefined();
    });
  });

  describe('repo format', () => {
    it('every repo starts with syncfusion/', () => {
      const packs = catalog.getAll();
      for (const pack of packs) {
        expect(pack.repo).toMatch(/^syncfusion\//);
      }
    });
  });
});
