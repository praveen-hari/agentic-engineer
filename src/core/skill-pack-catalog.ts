/**
 * Skill Pack catalog — 14 Syncfusion platform repos (DD-025).
 *
 * Each pack is one GitHub repo containing 60+ skills for a specific
 * platform. The unit of installation is the pack, not individual skills.
 * After install, the agent auto-loads the right skill per component name.
 */

export type SkillPackCategory = 'Web' | '.NET' | 'Document';

export interface SkillPack {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly category: SkillPackCategory;
  readonly repo: string;
  readonly skillCount: number;
  readonly representativeComponents: readonly string[];
}

const PACKS: readonly SkillPack[] = [
  // ─── Web (5) ──────────────────────────────────────────────────────
  {
    id: 'react-ui-components',
    name: 'React UI Components',
    platform: 'React',
    category: 'Web',
    repo: 'syncfusion/react-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'angular-ui-components',
    name: 'Angular UI Components',
    platform: 'Angular',
    category: 'Web',
    repo: 'syncfusion/angular-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'blazor-ui-components',
    name: 'Blazor UI Components',
    platform: 'Blazor',
    category: 'Web',
    repo: 'syncfusion/blazor-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'vue-ui-components',
    name: 'Vue UI Components',
    platform: 'Vue',
    category: 'Web',
    repo: 'syncfusion/vue-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'javascript-ui-controls',
    name: 'JavaScript UI Controls',
    platform: 'JavaScript',
    category: 'Web',
    repo: 'syncfusion/javascript-ui-controls-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },

  // ─── .NET (5) ─────────────────────────────────────────────────────
  {
    id: 'aspnet-core-ui-components',
    name: 'ASP.NET Core UI Components',
    platform: 'ASP.NET Core',
    category: '.NET',
    repo: 'syncfusion/aspnet-core-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'maui-ui-components',
    name: '.NET MAUI UI Components',
    platform: '.NET MAUI',
    category: '.NET',
    repo: 'syncfusion/maui-ui-components-skills',
    skillCount: 60,
    representativeComponents: ['DataGrid', 'Charts', 'Scheduler', 'RichTextEditor', 'Dropdown'],
  },
  {
    id: 'wpf-ui-controls',
    name: 'WPF UI Controls',
    platform: 'WPF',
    category: '.NET',
    repo: 'syncfusion/wpf-ui-controls-skills',
    skillCount: 60,
    representativeComponents: [
      'DataGrid',
      'Charts',
      'Scheduler',
      'RichTextEditor',
      'DockingManager',
    ],
  },
  {
    id: 'winui-ui-controls',
    name: 'WinUI UI Controls',
    platform: 'WinUI',
    category: '.NET',
    repo: 'syncfusion/winui-ui-controls-skills',
    skillCount: 60,
    representativeComponents: [
      'DataGrid',
      'Charts',
      'Scheduler',
      'RichTextEditor',
      'DockingManager',
    ],
  },
  {
    id: 'winforms-ui-controls',
    name: 'WinForms UI Controls',
    platform: 'WinForms',
    category: '.NET',
    repo: 'syncfusion/winforms-ui-controls-skills',
    skillCount: 60,
    representativeComponents: [
      'DataGrid',
      'Charts',
      'Schedule',
      'RichTextEditor',
      'DockingManager',
    ],
  },

  // ─── Document (4) ─────────────────────────────────────────────────
  {
    id: 'document-editor',
    name: 'Document Editor',
    platform: 'Document Editor',
    category: 'Document',
    repo: 'syncfusion/document-editor-skills',
    skillCount: 60,
    representativeComponents: ['WordDocumentEditor', 'TextFormatting', 'MailMerge', 'TrackChanges'],
  },
  {
    id: 'pdf-viewer',
    name: 'PDF Viewer',
    platform: 'PDF Viewer',
    category: 'Document',
    repo: 'syncfusion/pdf-viewer-skills',
    skillCount: 60,
    representativeComponents: ['PDFViewer', 'PDFAnnotation', 'PDFFormFilling', 'PDFSearch'],
  },
  {
    id: 'docx-editor',
    name: 'DOCX Editor',
    platform: 'DOCX Editor',
    category: 'Document',
    repo: 'syncfusion/docx-editor-skills',
    skillCount: 60,
    representativeComponents: ['WordDocument', 'TextFormatting', 'MailMerge', 'Export'],
  },
  {
    id: 'spreadsheet-editor',
    name: 'Spreadsheet Editor',
    platform: 'Spreadsheet Editor',
    category: 'Document',
    repo: 'syncfusion/spreadsheet-editor-skills',
    skillCount: 60,
    representativeComponents: [
      'Spreadsheet',
      'Formulas',
      'Charts',
      'DataImport',
      'ConditionalFormatting',
    ],
  },
];

/**
 * Catalog of all 14 Syncfusion skill packs (DD-025).
 * Provides lookup by category, platform, and ID.
 */
export class SkillPackCatalog {
  private readonly packs: readonly SkillPack[] = PACKS;

  /** Returns all 14 skill packs. */
  getAll(): readonly SkillPack[] {
    return this.packs;
  }

  /** Returns all packs in a given category. */
  getByCategory(category: SkillPackCategory): readonly SkillPack[] {
    return this.packs.filter((p) => p.category === category);
  }

  /** Returns packs matching a platform name. */
  getByPlatform(platform: string): readonly SkillPack[] {
    return this.packs.filter((p) => p.platform === platform);
  }

  /** Returns a pack by its ID, or undefined if not found. */
  getById(id: string): SkillPack | undefined {
    return this.packs.find((p) => p.id === id);
  }
}
