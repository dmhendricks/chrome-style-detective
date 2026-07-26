/*!
 * Chrome extension message protocol (service worker ↔ content ↔ options).
 *
 * Keep type strings and payloads in one place so send/receive sites cannot drift.
 */

export const MessageType = {
    PingOverlay: 'pingOverlay',
    SetOverlayArmed: 'setOverlayArmed',
    OverlayClaim: 'overlayClaim',
    DisarmOverlay: 'disarmOverlay',
    OpenOptions: 'openOptions',
    RegisterRestrictedTab: 'registerRestrictedTab',
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];

export type PingOverlayMessage = { type: typeof MessageType.PingOverlay };

export type SetOverlayArmedMessage = {
    type: typeof MessageType.SetOverlayArmed;
    armed: boolean;
};

export type OverlayClaimMessage = {
    type: typeof MessageType.OverlayClaim;
    instanceId: string;
};

export type DisarmOverlayMessage = { type: typeof MessageType.DisarmOverlay };

export type OpenOptionsMessage = { type: typeof MessageType.OpenOptions };

export type RegisterRestrictedTabMessage = {
    type: typeof MessageType.RegisterRestrictedTab;
    tabId?: number;
    url?: string;
};

/** All runtime / tabs messages Style Detective sends between its own scripts. */
export type ExtensionMessage =
    | PingOverlayMessage
    | SetOverlayArmedMessage
    | OverlayClaimMessage
    | DisarmOverlayMessage
    | OpenOptionsMessage
    | RegisterRestrictedTabMessage;

/** Typed constructors for outbound messages. */
export const Messages = {
    pingOverlay: (): PingOverlayMessage => ({ type: MessageType.PingOverlay }),

    setOverlayArmed: (armed: boolean): SetOverlayArmedMessage => ({
        type: MessageType.SetOverlayArmed,
        armed,
    }),

    overlayClaim: (instanceId: string): OverlayClaimMessage => ({
        type: MessageType.OverlayClaim,
        instanceId,
    }),

    disarmOverlay: (): DisarmOverlayMessage => ({ type: MessageType.DisarmOverlay }),

    openOptions: (): OpenOptionsMessage => ({ type: MessageType.OpenOptions }),

    registerRestrictedTab: (fields: {
        tabId?: number;
        url?: string;
    } = {}): RegisterRestrictedTabMessage => ({
        type: MessageType.RegisterRestrictedTab,
        ...fields,
    }),
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * Narrow an unknown `onMessage` payload to a known ExtensionMessage.
 * Returns null when the shape is unrecognized or incomplete.
 */
export function parseExtensionMessage(value: unknown): ExtensionMessage | null {
    if (!isRecord(value) || typeof value.type !== 'string') return null;

    switch (value.type) {
        case MessageType.PingOverlay:
            return Messages.pingOverlay();

        case MessageType.SetOverlayArmed:
            if (typeof value.armed !== 'boolean') return null;
            return Messages.setOverlayArmed(value.armed);

        case MessageType.OverlayClaim:
            if (typeof value.instanceId !== 'string') return null;
            return Messages.overlayClaim(value.instanceId);

        case MessageType.DisarmOverlay:
            return Messages.disarmOverlay();

        case MessageType.OpenOptions:
            return Messages.openOptions();

        case MessageType.RegisterRestrictedTab: {
            const tabId = typeof value.tabId === 'number' ? value.tabId : undefined;
            const url = typeof value.url === 'string' ? value.url : undefined;
            return Messages.registerRestrictedTab({ tabId, url });
        }

        default:
            return null;
    }
}
