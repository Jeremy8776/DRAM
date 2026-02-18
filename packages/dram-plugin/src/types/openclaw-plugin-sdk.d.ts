declare module "@mariozechner/openclaw-plugin-sdk" {
    export interface OpenClawPluginServiceContext {
        stateDir?: string;
        logger: {
            info: (...args: unknown[]) => void;
            error: (...args: unknown[]) => void;
            debug?: (...args: unknown[]) => void;
        };
    }

    export interface OpenClawPluginService {
        id: string;
        start?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
        stop?: () => void | Promise<void>;
    }

    export interface AnyAgentTool {
        label: string;
        name: string;
        description: string;
        parameters?: unknown;
        execute: (toolCallId: string, args: Record<string, unknown>) => Promise<unknown>;
    }

    export interface OpenClawPluginApi {
        version?: string;
        logger: {
            info: (...args: unknown[]) => void;
            error: (...args: unknown[]) => void;
            debug?: (...args: unknown[]) => void;
        };
        registerService: (service: OpenClawPluginService) => void;
        registerTool: (tool: AnyAgentTool) => void;
    }
}
