/**
 * @file profanity — Lista negra de palabras prohibidas para usernames.
 *
 * Cubre vocabulario español e inglés básico; no pretende ser exhaustiva,
 * basta para bloquear los casos más obvios.
 *
 * Estrategia de comparación: normaliza el input (minúsculas, sin acentos,
 * sin puntos/guion bajo, leet → letras) y luego hace `includes` contra
 * cada término. Esto atrapa variantes como `xputox`, `p3ne`, `pútö`.
 *
 * Para añadir términos, edita `BLACKLIST` y agrega tests en
 * `tests/authController.test.ts`.
 */

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

/** Marcas diacríticas combinables (acentos, diéresis, ...) tras NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normaliza un username para comparación contra la blacklist.
 *  - Pasa a minúsculas.
 *  - Quita acentos (NFD + drop combining marks).
 *  - Colapsa `.` y `_` (chars permitidos en username).
 *  - Convierte sustituciones leet típicas: 0→o, 1→i, 3→e, 4→a, 5→s, 7→t.
 */
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

/**
 * Verifica si un username CONTIENE (no solo es igual a) alguna palabra de
 * la blacklist tras normalizar.
 *
 * @param username Username crudo (cualquier capitalización / acentos).
 * @returns `true` si está prohibido, `false` si pasa.
 */
export const isProfane = (username: string): boolean => {
  const haystack = normalize(username);
  return BLACKLIST.some((bad) => haystack.includes(bad));
};
