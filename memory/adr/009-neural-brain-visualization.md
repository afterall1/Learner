# ADR-009: Neural Brain Visualization Architecture

**Status**: Accepted
**Date**: 2026-03-07

## Context

The Learner system needed a dedicated visualization for the AI "brain" — the neural network of cognitive modules (Evolution Engine, Bayesian Learning, Meta-Evolution, KDSS Signal, Risk Manager, etc.) and their signal interconnections. The visualization needed to:

1. Represent 10 neuron modules and 15 synaptic connections as a holographic 3D cortex
2. Show real-time activity levels, signal propagation, and module firing patterns
3. Provide a futuristic JARVIS/Iron Man-inspired aesthetic (user requirement)
4. Display historical activity data via a Memory Trace heatmap
5. Scale stably over time without visual degradation

## Decision

### 1. Holographic 3D SVG Architecture
- **Rendering**: Pure SVG for neurons and synapses (crisp vector rendering at any zoom)
- **3D Effect**: CSS `perspective: 1200px` + `transform-style: preserve-3d` + `rotateX(-4deg)` for depth
- **Aesthetic**: Monochrome cyan (`#00eaff`) with scan-line overlays, hex grid background, noise texture
- **Neuron Rendering**: Wireframe hexagons (inner/core tiers) and circles (outer tier), NOT solid fills

### 2. Biological Refractory Period (Neuroscience-Inspired)
- **Problem**: Cascade fire storms — one sensory fire triggers all 10 neurons within 3 frames, saturating everything at 100% permanently
- **Solution**: Per-neuron 800ms cooldown via `cooldownRef` Map. After firing, a neuron enters a refractory period and cannot fire again until 800ms passes
- **Rate**: Activity gain +0.35 per fire, decay 4.5x/sec → creates visible pulse-decay cycle

### 3. Multi-Color HSLA Heatmap Spectrum
- **Problem**: Single-color heatmap (all cyan) was unreadable — no row differentiation
- **Solution**: Each neuron assigned a unique hue from a curated 10-color spectrum:
  - EVO=270° (purple), BAY=210° (blue), META=320° (magenta), KDSS=30° (orange), SAIE=170° (teal), MKT=190° (cyan), FOR=350° (rose), EXP=145° (emerald), MAP=250° (lavender), REG=45° (gold)
- **Activity Mapping**: lightness = 15 + activity*45, alpha = 0.35 + activity*0.55

### 4. CSS Drop-Shadow Containment
- **Problem**: Always-on `drop-shadow(0 0 3px)` on 10 adjacent neuron groups compounded into massive glow blobs
- **Solution**: Removed default drop-shadow, applied only on `:hover` for interactive feedback

## Rationale

- **SVG over Canvas**: Crisp rendering, CSS hover/animation support, accessibility (DOM elements)
- **CSS 3D over WebGL**: Zero dependency, browser-native, sufficient for the visualization needs
- **Refractory Period over Rate Limiting**: Biologically accurate metaphor — real neurons have refractory periods. Creates natural wave propagation patterns
- **HSLA over RGB**: Hue rotation allows easy assignment of distinct colors per row; saturation/lightness controlled independently

## Consequences

### Positive
- Stable visualization that runs indefinitely without visual degradation
- Each neuron module is visually distinguishable in both the 3D view and heatmap
- Futuristic aesthetic matches the "brain of the trading system" concept
- Performance is excellent — pure CSS/SVG, no heavy libraries

### Negative
- Activity still shows 100% for recently-fired neurons (snapshot captures peak)
- 3D effect is subtle (4° tilt) — more dramatic angles cause readability issues

### Mitigation
- Time-averaged activity display can be added in a future iteration
- 3D tilt angle is configurable via CSS variable
