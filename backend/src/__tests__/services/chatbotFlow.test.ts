import chatbotFlowService from '../../services/chatbotFlow';

describe('ChatbotFlowService', () => {
  describe('getStartStep', () => {
    it('should return the start step with correct message', () => {
      const step = chatbotFlowService.getStartStep();
      expect(step).toBeDefined();
      expect(step.type).toBe('choice');
      expect(step.message).toContain('Willkommen bei der Kanzlei Tieben');
      expect(step.options).toBeDefined();
      expect(step.options?.length).toBe(6);
    });

    it('should have all required options in start step', () => {
      const step = chatbotFlowService.getStartStep();
      const labels = step.options?.map(opt => opt.label) || [];
      expect(labels).toContain('Kündigung Arbeitsvertrag');
      expect(labels).toContain('Abfindung verhandeln');
      expect(labels).toContain('Abmahnung erhalten');
      expect(labels).toContain('Probleme mit dem Vermieter / Mietkündigung');
      expect(labels).toContain('Räumungsklage');
      expect(labels).toContain('Sonstiges Anliegen');
    });
  });

  describe('getStep', () => {
    it('should return step for valid step ID', () => {
      const step = chatbotFlowService.getStep('start');
      expect(step).toBeDefined();
      expect(step?.type).toBe('choice');
    });

    it('should return null for invalid step ID', () => {
      const step = chatbotFlowService.getStep('invalid_step_id');
      expect(step).toBeNull();
    });
  });

  describe('getNextStep', () => {
    it('should return next step for choice type', () => {
      const nextStepId = chatbotFlowService.getNextStep('start', 0);
      expect(nextStepId).toBe('kuendigung_arbeitsvertrag_start');
    });

    it('should return next step from step.next property', () => {
      const nextStepId = chatbotFlowService.getNextStep('kuendigung_arbeitsvertrag_start');
      expect(nextStepId).toBe('kuendigung_arbeitsvertrag_art');
    });

    it('should return null if no next step', () => {
      const nextStepId = chatbotFlowService.getNextStep('end');
      expect(nextStepId).toBeNull();
    });
  });

  describe('determineLegalArea', () => {
    it('should identify Arbeitsrecht from flow path', () => {
      const result = chatbotFlowService.determineLegalArea([
        'start',
        'kuendigung_arbeitsvertrag_start',
        'kuendigung_arbeitsvertrag_art'
      ]);
      expect(result.area).toBe('Arbeitsrecht');
    });

    it('should identify Mietrecht from flow path', () => {
      const result = chatbotFlowService.determineLegalArea([
        'start',
        'kuendigung_mietvertrag_start',
        'mietvertrag_art'
      ]);
      expect(result.area).toBe('Mietrecht');
    });

    it('should default to Sonstiges for unknown paths', () => {
      const result = chatbotFlowService.determineLegalArea(['start', 'sonstiges_start']);
      expect(result.area).toBe('Sonstiges');
    });
  });

  describe('getCaseTypeId', () => {
    it('should return correct case type ID for Arbeitsrecht', () => {
      const id = chatbotFlowService.getCaseTypeId('Arbeitsrecht');
      expect(id).toBe(103);
    });

    it('should return correct case type ID for Mietrecht', () => {
      const id = chatbotFlowService.getCaseTypeId('Mietrecht');
      expect(id).toBe(108);
    });

    it('should return correct case type ID for Sonstiges', () => {
      const id = chatbotFlowService.getCaseTypeId('Sonstiges');
      expect(id).toBe(56);
    });
  });

  describe('Flow paths validation', () => {
    it('should have valid flow path for Kündigung Arbeitsvertrag', () => {
      const start = chatbotFlowService.getStep('start');
      const nextId = start?.options?.[0].next;
      expect(nextId).toBe('kuendigung_arbeitsvertrag_start');
      
      const nextStep = chatbotFlowService.getStep(nextId!);
      expect(nextStep).toBeDefined();
      expect(nextStep?.next).toBe('kuendigung_arbeitsvertrag_art');
    });

    it('should have valid flow path for Abfindung', () => {
      const start = chatbotFlowService.getStep('start');
      const nextId = start?.options?.[1].next;
      expect(nextId).toBe('abfindung_start');
      
      const abfindungStep = chatbotFlowService.getStep(nextId!);
      expect(abfindungStep).toBeDefined();
    });

    it('should have valid flow path for Abmahnung', () => {
      const start = chatbotFlowService.getStep('start');
      const nextId = start?.options?.[2].next;
      expect(nextId).toBe('abmahnung_start');
      
      const abmahnungStep = chatbotFlowService.getStep(nextId!);
      expect(abmahnungStep).toBeDefined();
    });

    it('should have valid flow path ending in contact_form', () => {
      const contactStep = chatbotFlowService.getStep('contact_form');
      expect(contactStep).toBeDefined();
      expect(contactStep?.type).toBe('contact');
      expect(contactStep?.next).toBe('gdpr_consent');
    });

    it('should have valid flow path ending in end', () => {
      const endStep = chatbotFlowService.getStep('end');
      expect(endStep).toBeDefined();
      expect(endStep?.type).toBe('end');
    });
  });
});

