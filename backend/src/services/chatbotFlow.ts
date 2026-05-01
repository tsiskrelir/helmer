import fs from 'fs';
import path from 'path';

export interface FlowStep {
  message: string;
  type: 'choice' | 'input' | 'file' | 'contact' | 'consent' | 'end';
  inputType?: 'text' | 'date' | 'email' | 'phone';
  options?: Array<{ label: string; next: string }>;
  next?: string;
  required?: boolean;
  fields?: string[];
}

export interface FlowConfig {
  [key: string]: FlowStep;
}

class ChatbotFlowService {
  private flowConfig: FlowConfig = {};

  constructor() {
    this.loadFlowConfig();
  }

  private loadFlowConfig(): void {
    const configPath = path.join(__dirname, '../config/chatbot-flow.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    this.flowConfig = JSON.parse(configData);
  }

  getStep(stepId: string): FlowStep | null {
    return this.flowConfig[stepId] || null;
  }

  getStartStep(): FlowStep {
    return this.flowConfig.start;
  }

  isValidStep(stepId: string): boolean {
    return stepId in this.flowConfig;
  }

  getNextStep(currentStepId: string, choiceIndex?: number): string | null {
    const step = this.getStep(currentStepId);
    if (!step) return null;

    if (step.type === 'choice' && step.options && choiceIndex !== undefined) {
      const option = step.options[choiceIndex];
      return option ? option.next : null;
    }

    return step.next || null;
  }

  determineLegalArea(flowPath: string[]): { area: string; topic: string } {
    // Analyze the flow path to determine legal area and topic
    const pathStr = flowPath.join(' ').toLowerCase();
    
    if (pathStr.includes('arbeitsvertrag') || pathStr.includes('abfindung') || pathStr.includes('abmahnung')) {
      return { area: 'Arbeitsrecht', topic: this.getTopicFromPath(pathStr, 'arbeitsrecht') };
    }
    
    if (pathStr.includes('mietvertrag') || pathStr.includes('miete') || pathStr.includes('räumung')) {
      return { area: 'Mietrecht', topic: this.getTopicFromPath(pathStr, 'mietrecht') };
    }
    
    return { area: 'Sonstiges', topic: 'Allgemein' };
  }

  private getTopicFromPath(pathStr: string, area: string): string {
    if (area === 'arbeitsrecht') {
      if (pathStr.includes('kündigung')) return 'Kündigung';
      if (pathStr.includes('abfindung')) return 'Abfindung';
      if (pathStr.includes('abmahnung')) return 'Abmahnung';
    }
    
    if (area === 'mietrecht') {
      if (pathStr.includes('kündigung')) return 'Mietkündigung';
      if (pathStr.includes('räumung')) return 'Räumungsklage';
      if (pathStr.includes('miete') || pathStr.includes('mängel')) return 'Mietstreit';
    }
    
    return 'Allgemein';
  }

  getCaseTypeId(legalArea: string): number {
    const caseTypeMap: { [key: string]: number } = {
      'Arbeitsrecht': parseInt(process.env.KLEOS_CASE_TYPE_ARBEITSRECHT || '103'),
      'Mietrecht': parseInt(process.env.KLEOS_CASE_TYPE_MIETRECHT || '108'),
      'Sonstiges': parseInt(process.env.KLEOS_CASE_TYPE_SONSTIGES || '56'),
    };
    
    return caseTypeMap[legalArea] || caseTypeMap['Sonstiges'];
  }
}

export default new ChatbotFlowService();

