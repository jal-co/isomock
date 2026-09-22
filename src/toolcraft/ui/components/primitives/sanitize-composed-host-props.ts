import type * as React from "react";

import blockedComposedHostProps from "./composed-host-blocked-props.json" with {
  type: "json",
};

type BlockedComposedHostPropName = keyof typeof blockedComposedHostProps;
type MarkupComposedHostPropName = {
  [Name in BlockedComposedHostPropName]:
    (typeof blockedComposedHostProps)[Name] extends "markup" ? Name : never;
}[BlockedComposedHostPropName];

export type SafeComposedHostProps<Props extends object> = Omit<Props, BlockedComposedHostPropName>;

export type SafeComposedHostElementProps<
  Tag extends keyof React.JSX.IntrinsicElements,
> = SafeComposedHostProps<React.ComponentProps<Tag>>;

export type SafeInteractionHostProps<Props extends object> = Omit<Props, MarkupComposedHostPropName>;

type BlockedComposedHostPropDomain = "markup" | "semantic";

function toAsciiLowercase(value: string): string {
  let normalized = "";
  for (let index = 0; index < value.length; index += 1) {
    switch (value[index]) {
      case "A": normalized += "a"; break;
      case "B": normalized += "b"; break;
      case "C": normalized += "c"; break;
      case "D": normalized += "d"; break;
      case "E": normalized += "e"; break;
      case "F": normalized += "f"; break;
      case "G": normalized += "g"; break;
      case "H": normalized += "h"; break;
      case "I": normalized += "i"; break;
      case "J": normalized += "j"; break;
      case "K": normalized += "k"; break;
      case "L": normalized += "l"; break;
      case "M": normalized += "m"; break;
      case "N": normalized += "n"; break;
      case "O": normalized += "o"; break;
      case "P": normalized += "p"; break;
      case "Q": normalized += "q"; break;
      case "R": normalized += "r"; break;
      case "S": normalized += "s"; break;
      case "T": normalized += "t"; break;
      case "U": normalized += "u"; break;
      case "V": normalized += "v"; break;
      case "W": normalized += "w"; break;
      case "X": normalized += "x"; break;
      case "Y": normalized += "y"; break;
      case "Z": normalized += "z"; break;
      default: normalized += value[index];
    }
  }
  return normalized;
}

function blockedComposedHostPropDomain(
  normalizedKey: string,
): BlockedComposedHostPropDomain | undefined {
  switch (normalizedKey) {
    case "dangerouslysetinnerhtml":
    case "srcdoc":
      return "markup";
    case "contenteditable":
    case "draggable":
    case "onabort":
    case "onabortcapture":
    case "onanimationend":
    case "onanimationendcapture":
    case "onanimationiteration":
    case "onanimationiterationcapture":
    case "onanimationstart":
    case "onanimationstartcapture":
    case "onauxclick":
    case "onauxclickcapture":
    case "onbeforeinput":
    case "onbeforeinputcapture":
    case "onbeforetoggle":
    case "onblur":
    case "onblurcapture":
    case "oncanplay":
    case "oncanplaycapture":
    case "oncanplaythrough":
    case "oncanplaythroughcapture":
    case "onchange":
    case "onchangecapture":
    case "onclick":
    case "onclickcapture":
    case "oncompositionend":
    case "oncompositionendcapture":
    case "oncompositionstart":
    case "oncompositionstartcapture":
    case "oncompositionupdate":
    case "oncompositionupdatecapture":
    case "oncontextmenu":
    case "oncontextmenucapture":
    case "oncopy":
    case "oncopycapture":
    case "oncut":
    case "oncutcapture":
    case "ondoubleclick":
    case "ondoubleclickcapture":
    case "ondrag":
    case "ondragcapture":
    case "ondragend":
    case "ondragendcapture":
    case "ondragenter":
    case "ondragentercapture":
    case "ondragexit":
    case "ondragexitcapture":
    case "ondragleave":
    case "ondragleavecapture":
    case "ondragover":
    case "ondragovercapture":
    case "ondragstart":
    case "ondragstartcapture":
    case "ondrop":
    case "ondropcapture":
    case "ondurationchange":
    case "ondurationchangecapture":
    case "onemptied":
    case "onemptiedcapture":
    case "onencrypted":
    case "onencryptedcapture":
    case "onended":
    case "onendedcapture":
    case "onerror":
    case "onerrorcapture":
    case "onfocus":
    case "onfocuscapture":
    case "ongotpointercapture":
    case "ongotpointercapturecapture":
    case "oninput":
    case "oninputcapture":
    case "oninvalid":
    case "oninvalidcapture":
    case "onkeydown":
    case "onkeydowncapture":
    case "onkeypress":
    case "onkeypresscapture":
    case "onkeyup":
    case "onkeyupcapture":
    case "onload":
    case "onloadcapture":
    case "onloadeddata":
    case "onloadeddatacapture":
    case "onloadedmetadata":
    case "onloadedmetadatacapture":
    case "onloadstart":
    case "onloadstartcapture":
    case "onlostpointercapture":
    case "onlostpointercapturecapture":
    case "onmousedown":
    case "onmousedowncapture":
    case "onmouseenter":
    case "onmouseleave":
    case "onmousemove":
    case "onmousemovecapture":
    case "onmouseout":
    case "onmouseoutcapture":
    case "onmouseover":
    case "onmouseovercapture":
    case "onmouseup":
    case "onmouseupcapture":
    case "onpaste":
    case "onpastecapture":
    case "onpause":
    case "onpausecapture":
    case "onplay":
    case "onplaycapture":
    case "onplaying":
    case "onplayingcapture":
    case "onpointercancel":
    case "onpointercancelcapture":
    case "onpointerdown":
    case "onpointerdowncapture":
    case "onpointerenter":
    case "onpointerleave":
    case "onpointermove":
    case "onpointermovecapture":
    case "onpointerout":
    case "onpointeroutcapture":
    case "onpointerover":
    case "onpointerovercapture":
    case "onpointerup":
    case "onpointerupcapture":
    case "onprogress":
    case "onprogresscapture":
    case "onratechange":
    case "onratechangecapture":
    case "onreset":
    case "onresetcapture":
    case "onscroll":
    case "onscrollcapture":
    case "onscrollend":
    case "onscrollendcapture":
    case "onseeked":
    case "onseekedcapture":
    case "onseeking":
    case "onseekingcapture":
    case "onselect":
    case "onselectcapture":
    case "onstalled":
    case "onstalledcapture":
    case "onsubmit":
    case "onsubmitcapture":
    case "onsuspend":
    case "onsuspendcapture":
    case "ontimeupdate":
    case "ontimeupdatecapture":
    case "ontoggle":
    case "ontouchcancel":
    case "ontouchcancelcapture":
    case "ontouchend":
    case "ontouchendcapture":
    case "ontouchmove":
    case "ontouchmovecapture":
    case "ontouchstart":
    case "ontouchstartcapture":
    case "ontransitioncancel":
    case "ontransitioncancelcapture":
    case "ontransitionend":
    case "ontransitionendcapture":
    case "ontransitionrun":
    case "ontransitionruncapture":
    case "ontransitionstart":
    case "ontransitionstartcapture":
    case "onvolumechange":
    case "onvolumechangecapture":
    case "onwaiting":
    case "onwaitingcapture":
    case "onwheel":
    case "onwheelcapture":
    case "role":
    case "tabindex":
      return "semantic";
    default:
      return undefined;
  }
}

export function sanitizeComposedHostProps<Props extends object>(props: Props): SafeComposedHostProps<Props> {
  const sanitized = { ...props } as Record<string, unknown>;
  for (const key in sanitized) {
    if (blockedComposedHostPropDomain(toAsciiLowercase(key))) {
      delete sanitized[key];
    }
  }
  return sanitized as SafeComposedHostProps<Props>;
}

export function sanitizeInteractionHostProps<Props extends object>(props: Props): SafeInteractionHostProps<Props> {
  const sanitized = { ...props } as Record<string, unknown>;
  for (const key in sanitized) {
    if (blockedComposedHostPropDomain(toAsciiLowercase(key)) === "markup") {
      delete sanitized[key];
    }
  }
  return sanitized as SafeInteractionHostProps<Props>;
}
