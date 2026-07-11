import type { SkillRegistry } from './skill-registry';
import type {
  ProcessLevel,
  RiskAssessment,
  SkillDefinition,
  SkillId,
} from './types';

/**
 * Skill activation rule engine (DD-007, DD-010).
 *
 * Given a {@link RiskAssessment} (with work type, process level, and
 * context signals), computes the set of active skills and a
 * human-readable reason for each activation.
 *
 * Activation is the union of:
 *   1. Always-active skills (background policies)
 *   2. Task-type skills (triggered by work type)
 *   3. Context skills (triggered by workspace context signals)
 *   4. Process-level skills (additive — higher levels include lower)
 *
 * Skills are deduplicated — a skill activated by multiple rules
 * appears once, with the first matching reason.
 */
export class SkillEngine {
  constructor(private readonly registry: SkillRegistry) {}

  /**
   * Compute the set of active skills for a given risk assessment.
   */
  computeActiveSkills(assessment: RiskAssessment): {
    activeSkills: SkillId[];
    activationReasons: Record<string, string>;
  } {
    const activeSkills = new Set<SkillId>();
    const reasons: Record<string, string> = {};

    // 1. Always-active skills
    for (const skill of this.registry.getByCategory('always')) {
      activeSkills.add(skill.id);
      reasons[skill.id] = 'Always active (background policy)';
    }

    // 2. Task-type skills
    for (const skill of this.registry.getByCategory('by-task-type')) {
      if (skill.activation.workTypes?.includes(assessment.workType)) {
        if (this.meetsMinProcessLevel(skill, assessment.processLevel)) {
          if (!activeSkills.has(skill.id)) {
            activeSkills.add(skill.id);
            reasons[skill.id] = `Activated because task type is '${assessment.workType}'`;
          }
        }
      }
    }

    // 3. Context skills
    for (const skill of this.registry.getByCategory('by-context')) {
      if (skill.activation.contextSignals?.some((s) => assessment.contextSignals.includes(s))) {
        if (this.meetsMinProcessLevel(skill, assessment.processLevel)) {
          if (!activeSkills.has(skill.id)) {
            activeSkills.add(skill.id);
            const matchedSignal = skill.activation.contextSignals.find((s) =>
              assessment.contextSignals.includes(s),
            )!;
            reasons[skill.id] = `Activated because context signal '${matchedSignal}' detected`;
          }
        }
      }
    }

    // 4. Process-level skills (additive)
    this.addProcessLevelSkills(assessment.processLevel, activeSkills, reasons);

    // 5. Quality-gate skills (activated at standard+ process)
    for (const skill of this.registry.getByCategory('quality-gate')) {
      if (this.meetsMinProcessLevel(skill, assessment.processLevel)) {
        if (!activeSkills.has(skill.id)) {
          activeSkills.add(skill.id);
          reasons[skill.id] = `Activated because process level is '${assessment.processLevel}'`;
        }
      }
    }

    // 6. Specialist agents (activated at thorough+ process)
    for (const skill of this.registry.getByCategory('specialist')) {
      if (this.meetsMinProcessLevel(skill, assessment.processLevel)) {
        if (!activeSkills.has(skill.id)) {
          activeSkills.add(skill.id);
          reasons[skill.id] = `Activated because process level is '${assessment.processLevel}' (specialist review)`;
        }
      }
    }

    return {
      activeSkills: Array.from(activeSkills),
      activationReasons: reasons,
    };
  }

  /**
   * Check if a skill's minimum process level is met.
   * Process levels are ordered: light < standard < thorough < guarded
   */
  private meetsMinProcessLevel(skill: SkillDefinition, processLevel: ProcessLevel): boolean {
    const min = skill.activation.minProcessLevel;
    if (!min) return true;
    return PROCESS_LEVEL_ORDER[processLevel] >= PROCESS_LEVEL_ORDER[min];
  }

  /**
   * Add process-level skills (additive — higher levels include lower).
   */
  private addProcessLevelSkills(
    level: ProcessLevel,
    activeSkills: Set<SkillId>,
    reasons: Record<string, string>,
  ): void {
    const levels: ProcessLevel[] = ['light', 'standard', 'thorough', 'guarded'];

    for (const lvl of levels) {
      if (PROCESS_LEVEL_ORDER[lvl] > PROCESS_LEVEL_ORDER[level]) break;

      const levelSkills = PROCESS_LEVEL_SKILLS[lvl];
      for (const skillId of levelSkills) {
        if (!activeSkills.has(skillId)) {
          activeSkills.add(skillId);
          reasons[skillId] = `Activated because process level is '${level}'`;
        }
      }
    }
  }
}

// ─── Process Level Ordering ──────────────────────────────────────────────

const PROCESS_LEVEL_ORDER: Readonly<Record<ProcessLevel, number>> = {
  light: 0,
  standard: 1,
  thorough: 2,
  guarded: 3,
};

// ─── Process-Level Skill Additions ────────────────────────────────────────
//
// Additive: each level includes the skills from all lower levels.
// These are skills that are activated purely by process level,
// not by task type or context (those are handled separately above).

const PROCESS_LEVEL_SKILLS: Readonly<Record<ProcessLevel, readonly SkillId[]>> = {
  light: [],
  standard: ['code-review-and-quality', 'code-simplification'],
  thorough: [
    'doubt-driven-development',
    'shipping-and-launch',
    'security-and-hardening',
    'performance-optimization',
    'documentation-and-adrs',
  ],
  guarded: ['security-auditor', 'web-performance-auditor'],
};
