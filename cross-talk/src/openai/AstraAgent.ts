import OpenAI from 'openai';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import { CrosstalkError } from '../protocol';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { Registration } from '../protocol';
import { objectSchema, strictInputSchema } from '../protocol/validation';
import { astraInstructions } from './PromptBuilder';
export interface AgentCall { id: string; name: string; arguments: unknown; explicitUserRequest: boolean }
export interface AgentResponse { text: string; calls: AgentCall[]; output: ResponseInputItem[] }
export interface ReasoningAgent {
  respond(registration: Registration, input: ResponseInputItem[], signal: AbortSignal): Promise<AgentResponse>;
}
export class AstraAgent implements ReasoningAgent {
  constructor(private client: OpenAI, private model = 'gpt-6-astra', private effort: 'low' | 'medium' | 'high' = 'medium') {}
  async respond(registration: Registration, input: ResponseInputItem[], signal: AbortSignal): Promise<AgentResponse> {
    const response = await this.client.responses.create({
      model: this.model, reasoning: { effort: this.effort }, store: false, include: ['reasoning.encrypted_content'], max_output_tokens: 4096,
      instructions: astraInstructions + '\nAPPLICATION MANIFEST\n' + JSON.stringify(registration.manifest),
      tools: registration.tools.map(tool => ({ type: 'function' as const, name: tool.name, description: `${tool.description}\nEffect: ${tool.effect}; confirmation: ${tool.confirmation}.`, strict: true,
        parameters: objectSchema({ input: strictInputSchema(tool), explicitUserRequest: { type: 'boolean', description: 'True only if the latest user directly requested this specific action.' } }),
      })), parallel_tool_calls: false, input,
    }, { signal });
    if (response.status !== 'completed') throw new CrosstalkError('REASONING_INCOMPLETE', `Reasoning did not complete: ${response.incomplete_details?.reason ?? response.status}`, true);
    return { text: response.output_text, output: toResponseInputItems(response.output), calls: response.output.flatMap(item => {
      if (item.type !== 'function_call') return [];
      let args: any;
      try { args = JSON.parse(item.arguments); } catch { args = {}; }
      return [{ id: item.call_id, name: item.name, arguments: args.input, explicitUserRequest: args.explicitUserRequest === true }];
    }) };
  }
}
