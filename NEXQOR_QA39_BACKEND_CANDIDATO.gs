/**
 * NEXQOR QA 3.9 — CANDIDATO, NO INSTALADO
 * Enriquecimiento academico de Primaria para Direccion.
 *
 * Dependencias del backend original:
 * LA240_BLOQUES, LA240_MATERIAS, laFilas_,
 * la14FechaCelda_ y las clases de la231Clases_.
 *
 * No sustituye funciones operativas.
 * No modifica pases ni detalles individuales.
 */

function nxq39AcademicoDireccion_(ss, sesion, fecha, dia, clases) {
  if (!sesion ||
      !['general', 'direccion'].includes(sesion.rol)) {
    return clases;
  }

  if (sesion.perfilPersonalizado &&
      (!Array.isArray(sesion.permisos) ||
       !sesion.permisos.includes('pases'))) {
    return clases;
  }

  if (!clases.some(c => c && c.nivel === 'Primaria')) {
    return clases;
  }

  const normal = x => String(x == null ? '' : x)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

  const horarios = new Map();

  LA240_BLOQUES.forEach(r => {
    if (r[1] !== dia) return;
    const clave = [r[1], r[2], r[3]].join('|');
    if (!horarios.has(clave)) horarios.set(clave, []);
    horarios.get(clave).push(r);
  });

  const docentes = new Map(
    laFilas_(ss, 'DOCENTES', 8)
      .map(r => [String(r[0]), String(r[1])])
      .filter(r => r[0] && r[1])
  );

  const pases = new Map();

  laFilas_(ss, 'PASES', 12).forEach(p => {
    if (la14FechaCelda_(p[1]) !== fecha ||
        normal(p[2]) !== 'PRIMARIA') return;

    const id = String(p[6] || '');
    if (!pases.has(id)) pases.set(id, []);
    pases.get(id).push(p);
  });

  return clases.map(c => {
    if (!c || c.nivel !== 'Primaria') return c;

    const id = String(c.horarioId || '');
    const grupoId = String(c.grupoId || '');
    const grupo = /^PRI-([1-6])-([A-Z])$/.exec(grupoId);
    const numero = Number(c.modulo);

    const esperado = grupo && Number.isInteger(numero)
      ? 'PRIMARIA-MODULO:' + grupoId +
        ':PRI-G' + grupo[1] + '-' + dia +
        '-M' + String(numero).padStart(2, '0')
      : '';

    const clave = [
      dia,
      grupo ? grupo[1] + '-' + grupo[2] : '',
      c.inicio
    ].join('|');

    const coincidencias = horarios.get(clave) || [];

    const a = {
      fuente: 'LA240_BLOQUES',
      horarioId: id,
      materia: null,
      materiaId: null,
      docenteProgramado: null,
      docenteProgramadoId: null,
      docenteRegistrante: null,
      docenteRegistranteId: null,
      estado: 'SIN_PASE',
      alertas: [],
      vigenciaAcreditada: false
    };

    if (!esperado || id !== esperado) {
      a.alertas.push('HORARIO_ID_INCOMPATIBLE');
    }

    if (coincidencias.length !== 1) {
      a.alertas.push('HORARIO_NO_UNICO');
    }

    if (coincidencias.length === 1) {
      const r = coincidencias[0];
      const materia = LA240_MATERIAS[r[4]];

      if (materia && materia[0] && materia[1]) {
        a.materia = String(materia[0]);
        a.materiaId = String(materia[1]);
      } else {
        a.alertas.push('MATERIA_NO_LOCALIZADA');
      }

      if (docentes.has(r[0])) {
        a.docenteProgramadoId = r[0];
        a.docenteProgramado = docentes.get(r[0]);
      } else {
        a.alertas.push('DOCENTE_NO_LOCALIZADO');
      }
    }

    const encontrados = pases.get(id) || [];
    const activos = encontrados.filter(p =>
      !['ANULADO', 'CANCELADO'].includes(normal(p[10]))
    );

    if (activos.length > 1) {
      a.estado = 'REVISION';
      a.alertas.push('PASE_DUPLICADO');
    } else if (activos.length === 1) {
      const p = activos[0];

      if (normal(p[10]) !== 'CONFIRMADO') {
        a.estado = 'REVISION';
        a.alertas.push('PASE_NO_CONFIRMADO');
      } else {
        a.estado = 'CONFIRMADO';
        const registranteId = String(p[7] || '');

        if (String(p[3]) !== grupoId) {
          a.alertas.push('GRUPO_DIVERGENTE');
        }

        if (!docentes.has(registranteId)) {
          a.alertas.push('REGISTRANTE_NO_LOCALIZADO');
        }

        a.docenteDistintoDelProgramado = Boolean(
          a.docenteProgramadoId &&
          registranteId !== a.docenteProgramadoId
        );

        if (!a.alertas.length) {
          a.docenteRegistranteId = registranteId;
          a.docenteRegistrante =
            docentes.get(registranteId);
        }
      }
    } else if (encontrados.length) {
      a.estado = 'CANCELADO';
    }

    if (a.alertas.length) a.estado = 'REVISION';

    if (a.estado !== 'CONFIRMADO') {
      a.docenteRegistranteId = null;
      a.docenteRegistrante = null;
    }

    return {...c, nxqAcademico: a};
  });
}
