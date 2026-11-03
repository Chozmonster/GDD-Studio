declare module "nspell" {
  type Dictionary = { aff: string | Uint8Array; dic: string | Uint8Array };
  type NSpell = {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
    add: (word: string) => void;
    remove: (word: string) => void;
  };
  export default function nspell(dictionary: Dictionary): NSpell;
}
