// Tests del helper isUnivalleEmail.
// El helper es puro (sin dependencias externas), así que no necesitamos mocks.

import {
  isUnivalleEmail,
  UNIVALLE_DOMAIN,
  universityLabel,
} from "../src/utils/univalleEmail";

describe("isUnivalleEmail", () => {
  it("UNIVALLE_DOMAIN está expuesto y es el esperado", () => {
    expect(UNIVALLE_DOMAIN).toBe("correounivalle.edu.co");
  });

  it("identifica correos institucionales en minúsculas", () => {
    expect(isUnivalleEmail("ana.perez@correounivalle.edu.co")).toBe(true);
  });

  it("identifica correos institucionales sin importar la capitalización", () => {
    expect(isUnivalleEmail("Ana.Perez@CorreoUnivalle.edu.co")).toBe(true);
    expect(isUnivalleEmail("X@CORREOUNIVALLE.EDU.CO")).toBe(true);
  });

  it("tolera espacios en los extremos", () => {
    expect(isUnivalleEmail("  ana@correounivalle.edu.co  ")).toBe(true);
  });

  it("rechaza correos de otros dominios", () => {
    expect(isUnivalleEmail("ana@gmail.com")).toBe(false);
    expect(isUnivalleEmail("ana@univalle.edu.co")).toBe(false);
    expect(isUnivalleEmail("ana@.correounivalle.edu.co")).toBe(false);
  });

  it("rechaza intentos de spoofing donde el dominio no es el sufijo real", () => {
    expect(isUnivalleEmail("ana@correounivalle.edu.co.evil.com")).toBe(false);
    expect(isUnivalleEmail("ana@fake-correounivalle.edu.co")).toBe(false);
  });

  describe("universityLabel", () => {
    it("devuelve 'Univalle' para correos del dominio institucional", () => {
      expect(universityLabel("ana@correounivalle.edu.co")).toBe("Univalle");
      expect(universityLabel("Ana@CorreoUnivalle.edu.co")).toBe("Univalle");
    });

    it("devuelve 'No identificado' para cualquier otro correo", () => {
      expect(universityLabel("ana@gmail.com")).toBe("No identificado");
      expect(universityLabel("ana@univalle.edu.co")).toBe("No identificado");
      expect(universityLabel("")).toBe("No identificado");
    });
  });

  it("rechaza valores no-string o vacíos", () => {
    expect(isUnivalleEmail("")).toBe(false);
    // @ts-expect-error — comprobación defensiva de runtime
    expect(isUnivalleEmail(undefined)).toBe(false);
    // @ts-expect-error
    expect(isUnivalleEmail(null)).toBe(false);
    // @ts-expect-error
    expect(isUnivalleEmail(123)).toBe(false);
  });
});
