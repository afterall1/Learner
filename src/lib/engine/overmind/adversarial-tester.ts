// ============================================================
// Learner: Adversarial Tester — Strategy Stress Testing
// ============================================================
// Radical Innovation #1: Adversarial Co-Evolution (ACE)
// Uses Opus 4.6 to generate adversarial market scenarios
// specifically designed to break each strategy. Strategies
// that survive earn a resilience fitness bonus.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type AdversarialScenario,
    type AdversarialResult,
    type ResilienceReport,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import { type StrategyDNA, MarketRegime } from '@/types';
import { OpusClient } from './opus-client';
import { buildAdversarialPrompt, getSystemPrompt } from './prompt-engine';
import { isAdversarialArray } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';

// ─── Adversarial Tester ──────────────────────────────────────

export class AdversarialTester {
    private reports: Map<string, ResilienceReport> = new Map();
    private scenarioLibrary: AdversarialScenario[] = [];
    private readonly maxResilienceBonus: number;
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(
        maxResilienceBonus: number = 5,
        journal: ReasoningJournal,
    ) {
        this.maxResilienceBonus = maxResilienceBonus;
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── Scenario Generation ─────────────────────────────────

    /**
     * Generate adversarial scenarios for a strategy via Opus 4.6.
     */
    async generateScenarios(
        strategy: StrategyDNA,
        regime: MarketRegime | null,
    ): Promise<AdversarialScenario[]> {
        if (!this.opus.isAvailable()) {
            return this.getFallbackScenarios();
        }

        const strategyInfo = {
            name: strategy.name,
            indicators: strategy.indicators.map(i => `${i.type}(${i.period})`),
            riskGenes: {
                stopLossPercent: strategy.riskGenes.stopLossPercent,
                takeProfitPercent: strategy.riskGenes.takeProfitPercent,
                maxLeverage: strategy.riskGenes.maxLeverage,
            },
            hasAdvancedGenes: !!(
                strategy.microstructureGenes?.length ||
                strategy.priceActionGenes?.length ||
                strategy.compositeGenes?.length ||
                strategy.dcGenes?.length
            ),
            advancedGeneTypes: [
                ...(strategy.microstructureGenes?.map(g => `micro:${g.type}`) ?? []),
                ...(strategy.priceActionGenes?.map(g => `pa:${g.type}`) ?? []),
                ...(strategy.compositeGenes?.map(g => `comp:${g.operation}`) ?? []),
                ...(strategy.dcGenes?.map(() => 'dc:theta') ?? []),
            ],
        };

        const prompt = buildAdversarialPrompt(strategyInfo, regime);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isAdversarialArray,
            { temperature: 0.6, budgetTokens: 6_000 },
        );

        if (!response?.content) {
            return this.getFallbackScenarios();
        }

        const scenarios = this.parseScenarioResponse(response.content);

        // Add to library
        for (const scenario of scenarios) {
            this.scenarioLibrary.push(scenario);
        }

        // Record in journal
        this.journal.recordEntry(
            OvermindEventType.ADVERSARIAL_TEST,
            null,
            { regime, generation: null, populationSize: null, bestFitness: null },
            `Generated ${scenarios.length} adversarial scenarios for ${strategy.name}`,
            0.7,
            response.usage.totalTokens,
        );

        return scenarios;
    }

    /**
     * Evaluate a strategy's resilience against adversarial scenarios.
     * This is a reasoning-based evaluation, not a simulation.
     */
    evaluateResilience(
        strategy: StrategyDNA,
        scenarios: AdversarialScenario[],
    ): ResilienceReport {
        const results: AdversarialResult[] = [];

        for (const scenario of scenarios) {
            const result = this.evaluateAgainstScenario(strategy, scenario);
            results.push(result);
        }

        const survived = results.filter(r => r.survived).length;
        const resilienceScore = scenarios.length > 0
            ? (survived / scenarios.length) * 100
            : 50; // Default when no scenarios

        const fitnessBonus = (resilienceScore / 100) * this.maxResilienceBonus;

        const criticalVulnerabilities = results
            .filter(r => !r.survived && r.vulnerabilityExposed)
            .map(r => r.vulnerabilityExposed!)
            .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

        const report: ResilienceReport = {
            strategyId: strategy.id,
            resilienceScore,
            scenariosTested: scenarios.length,
            scenariosSurvived: survived,
            results,
            criticalVulnerabilities,
            fitnessBonus: Math.round(fitnessBonus * 10) / 10,
            testedAt: Date.now(),
        };

        this.reports.set(strategy.id, report);
        return report;
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get resilience report for a strategy.
     */
    getReport(strategyId: string): ResilienceReport | null {
        return this.reports.get(strategyId) ?? null;
    }

    /**
     * Get average resilience score across all tested strategies.
     */
    getAverageResilience(): number {
        if (this.reports.size === 0) return 0;
        const total = Array.from(this.reports.values())
            .reduce((sum, r) => sum + r.resilienceScore, 0);
        return total / this.reports.size;
    }

    /**
     * Get total adversarial tests run.
     */
    getTotalTestsRun(): number {
        return Array.from(this.reports.values())
            .reduce((sum, r) => sum + r.scenariosTested, 0);
    }

    /**
     * Get scenario library size.
     */
    getScenarioLibrarySize(): number {
        return this.scenarioLibrary.length;
    }

    // ─── Internal ────────────────────────────────────────────

    /**
     * Evaluate a strategy against a single adversarial scenario
     * using rule-based heuristics.
     */
    private evaluateAgainstScenario(
        strategy: StrategyDNA,
        scenario: AdversarialScenario,
    ): AdversarialResult {
        let performanceScore = 100;
        let survived = true;
        let vulnerabilityExposed: string | null = null;
        let hardeningSuggestion: string | null = null;

        for (const condition of scenario.conditions) {
            switch (condition.variable) {
                case 'liquidity':
                    if (condition.change === 'collapse' && condition.magnitude > 0.7) {
                        // High leverage strategies are most vulnerable
                        if (strategy.riskGenes.maxLeverage > 7) {
                            performanceScore -= 40;
                            vulnerabilityExposed = 'High leverage amplifies liquidity crisis losses';
                            hardeningSuggestion = 'Reduce max leverage to 5x or below';
                        } else {
                            performanceScore -= 15;
                        }
                    }
                    break;

                case 'volatility':
                    if (condition.change === 'spike' && condition.magnitude > 0.7) {
                        // Tight stop-losses get destroyed
                        if (strategy.riskGenes.stopLossPercent < 1.5) {
                            performanceScore -= 35;
                            vulnerabilityExposed = 'Stop-loss too tight for volatility spikes';
                            hardeningSuggestion = 'Use ATR-adaptive stop-loss or widen to 2%+';
                        } else {
                            performanceScore -= 10;
                        }
                    }
                    break;

                case 'spread':
                    if (condition.change === 'spike') {
                        performanceScore -= condition.magnitude * 20;
                    }
                    break;

                case 'correlation':
                    if (condition.change === 'invert') {
                        // Cross-pair strategies suffer
                        performanceScore -= 15;
                    }
                    break;

                case 'regime':
                    if (condition.change === 'whipsaw') {
                        // All strategies suffer in whipsaw
                        performanceScore -= condition.magnitude * 30;
                        if (!strategy.dcGenes?.length) {
                            vulnerabilityExposed = 'No Directional Change genes to detect regime whipsaw';
                            hardeningSuggestion = 'Add DC genes with theta threshold for regime detection';
                        }
                    }
                    break;

                case 'volume':
                    if (condition.change === 'collapse') {
                        if (strategy.microstructureGenes?.some(g => g.type === 'VOLUME_PROFILE')) {
                            performanceScore -= 25;
                            vulnerabilityExposed = 'Volume-dependent strategy fails in volume collapse';
                        }
                    }
                    break;

                case 'gap':
                    if (condition.change === 'jump') {
                        performanceScore -= condition.magnitude * 25;
                    }
                    break;
            }
        }

        // Determine survival
        if (performanceScore < 30) {
            survived = false;
        }

        // Severity affects scoring
        const severityMultiplier: Record<string, number> = {
            critical: 1.5,
            high: 1.2,
            medium: 1.0,
            low: 0.8,
        };
        const mult = severityMultiplier[scenario.severity] ?? 1.0;
        performanceScore = Math.max(0, Math.min(100, performanceScore * mult));

        return {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            strategyId: strategy.id,
            strategyName: strategy.name,
            survived,
            performanceScore: Math.round(performanceScore),
            vulnerabilityExposed,
            hardeningSuggestion,
        };
    }

    /**
     * Parse adversarial scenario response from Opus.
     */
    private parseScenarioResponse(rawContent: unknown): AdversarialScenario[] {
        let rawScenarios: unknown[] = [];

        if (Array.isArray(rawContent)) {
            rawScenarios = rawContent;
        } else if (typeof rawContent === 'object' && rawContent !== null) {
            const obj = rawContent as Record<string, unknown>;
            if (Array.isArray(obj.scenarios)) {
                rawScenarios = obj.scenarios;
            }
        }

        return rawScenarios.map((s: unknown) => {
            const r = s as Record<string, unknown>;
            return {
                id: uuidv4(),
                name: String(r.name || 'Unknown Scenario'),
                description: String(r.description || ''),
                conditions: Array.isArray(r.conditions) ? r.conditions.map((c: unknown) => {
                    const cond = c as Record<string, unknown>;
                    return {
                        variable: String(cond.variable || 'volatility') as 'volatility' | 'liquidity' | 'spread' | 'correlation' | 'regime' | 'volume' | 'gap',
                        change: String(cond.change || 'spike') as 'spike' | 'collapse' | 'invert' | 'whipsaw' | 'freeze' | 'jump',
                        magnitude: Math.max(0, Math.min(1, Number(cond.magnitude) || 0.5)),
                        description: String(cond.description || ''),
                    };
                }) : [],
                targetedVulnerabilities: Array.isArray(r.targetedVulnerabilities)
                    ? r.targetedVulnerabilities.map(String)
                    : [],
                severity: (String(r.severity || 'medium')) as 'critical' | 'high' | 'medium' | 'low',
                adversarialReasoning: String(r.adversarialReasoning || ''),
            };
        }).filter(s => s.name !== 'Unknown Scenario');
    }

    /**
     * Fallback scenarios when API is unavailable.
     */
    private getFallbackScenarios(): AdversarialScenario[] {
        return [
            {
                id: uuidv4(),
                name: 'Flash Crash',
                description: 'Sudden 10% price drop within 5 minutes',
                conditions: [
                    { variable: 'volatility', change: 'spike', magnitude: 0.9, description: 'Extreme volatility spike' },
                    { variable: 'liquidity', change: 'collapse', magnitude: 0.7, description: 'Order book thins dramatically' },
                ],
                targetedVulnerabilities: ['Stop-loss slippage', 'Position sizing'],
                severity: 'critical',
                adversarialReasoning: 'Flash crashes expose tight stop-losses and high leverage positions',
            },
            {
                id: uuidv4(),
                name: 'Regime Whipsaw',
                description: 'Rapid alternation between trending and ranging conditions',
                conditions: [
                    { variable: 'regime', change: 'whipsaw', magnitude: 0.8, description: 'Market switches direction every few candles' },
                ],
                targetedVulnerabilities: ['Trend-following entries', 'Regime detection lag'],
                severity: 'high',
                adversarialReasoning: 'Strategies optimized for stable regimes fail in whipsaw conditions',
            },
            {
                id: uuidv4(),
                name: 'Volume Vacuum',
                description: 'Extended period of extremely low volume',
                conditions: [
                    { variable: 'volume', change: 'collapse', magnitude: 0.8, description: 'Volume drops to 10% of normal' },
                    { variable: 'spread', change: 'spike', magnitude: 0.6, description: 'Spread doubles' },
                ],
                targetedVulnerabilities: ['Volume-dependent signals', 'Slippage on entry/exit'],
                severity: 'medium',
                adversarialReasoning: 'Volume-dependent indicators generate false signals in low-volume conditions',
            },
        ];
    }
}
