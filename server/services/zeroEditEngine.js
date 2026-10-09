import { textProcessingService } from './textProcessingService.js';

export class ZeroEditEngine {
  checkSnippets(text) {
    return textProcessingService.checkSnippets(text);
  }

  cleanText(text) {
    return textProcessingService.cleanText(text);
  }

  buildSystemPrompt(options = {}) {
    return textProcessingService.buildSystemPrompt(options);
  }

  localHeuristicCleanup(text, options = {}) {
    return textProcessingService.localHeuristicCleanup(text, options);
  }

  formatWithLlm(text, options = {}) {
    return textProcessingService.formatWithLlm(text, options);
  }

  process(rawTranscript, options = {}) {
    return textProcessingService.process(rawTranscript, options);
  }
}

export const zeroEditEngine = new ZeroEditEngine();
