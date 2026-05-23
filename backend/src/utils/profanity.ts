// Lista negra de palabras prohibidas para usernames.
// Se compara en minúsculas, sin acentos, y reemplazando algunas sustituciones
// comunes (l33t-speak) para que "p3ne" o "pútö" caigan dentro del mismo término.
// La lista cubre vocabulario español e inglés básico; no pretende ser
// exhaustiva — basta para bloquear los casos más obvios.

const BLACKLIST: readonly string[] = [
  // ES
  "puta", "puto", "putas", "putos",
  "mierda", "mrda",
  "verga", "vrga",
  "pene", "pen3",
  "vagina",
  "concha", "conchatumadre", "ctm",
  "pendejo", "pendeja",
  "marica", "maricon",
  "joder", "jodete",
  "cabron", "cabrona",
  "polla", "pollas",
  "gilipollas",
  "zorra", "zorras",
  "cono", "conyo", "conchu",
  "culero", "culera",
  "imbecil",
  "estupido", "estupida",
  "idiota",
  // EN
  "fuck", "fck", "fuk",
  "shit",
  "bitch",
  "asshole",
  "dick",
  "cunt",
  "pussy",
  "nigger", "nigga",
  "faggot",
  "whore",
  "slut",
  "bastard",
  "retard",
];

// Normaliza: minúsculas, quita marcas diacríticas (acentos), colapsa puntos/
// guiones bajos y convierte sustituciones leet típicas (0→o, 1→i, 3→e, 4→a,
// 5→s, 7→t) para atajar variaciones como "p3ne" o "pútö".
const COMBINING_MARKS = /[̀-ͯ]/g;

const normalize = (input: string): string =>
  input
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[._]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");

// True si el username contiene (no solo es) alguna palabra de la blacklist.
// Usamos `includes` para atajar variantes como "xputox" o "iputa3".
export const isProfane = (username: string): boolean => {
  const haystack = normalize(username);
  return BLACKLIST.some((bad) => haystack.includes(bad));
};
