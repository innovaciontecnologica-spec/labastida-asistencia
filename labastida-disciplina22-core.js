/* LABASTIDA 2.2 — motor puro de simulación/QA, sin red ni escrituras.
 * Las medidas solo pueden surtir efectos tras revisión, autorización y aviso.
 * La aplicación no decide por sí sola impedir físicamente el ingreso.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabastidaDisciplina22 = api;
})(typeof globalThis !== 'undefined' ? globalThis : undefined, function () {
  'use strict';
  const TIPOS = new Set(['Retardo de entrada', 'Ingreso diferido']);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  function validarFecha(fecha) {
    if (typeof fecha !== 'string' || !ISO.test(fecha) ||
        new Date(fecha + 'T12:00:00Z').toISOString().slice(0, 10) !== fecha) {
      throw Error('Fecha inválida: se espera AAAA-MM-DD.');
    }
    return fecha;
  }

  function diasLectivosPosteriores(calendario, despuesDe, dias) {
    validarFecha(despuesDe);
    if (!Number.isInteger(dias) || dias < 1 || dias > 3) throw Error('Duración inválida.');
    const validos = [...new Set(calendario.map(validarFecha))]
      .filter(fecha => fecha > despuesDe).sort().slice(0, dias);
    if (validos.length !== dias) throw Error('Calendario lectivo insuficiente para programar la medida.');
    return validos;
  }

  function estadoMedida(medida, hoy) {
    validarFecha(hoy);
    if (!medida) return 'NINGUNA';
    if (medida.estado === 'CANCELADA') return 'CANCELADA';
    if (medida.estado !== 'AUTORIZADA') return 'PENDIENTE_REVISION';
    const dias = medida.diasLectivos;
    if (!Array.isArray(dias) || !dias.length) throw Error('Medida sin calendario autorizado.');
    const ordenados = [...dias].sort();
    if (hoy < ordenados[0]) return 'PROGRAMADA';
    if (hoy > ordenados[ordenados.length - 1]) return 'CUMPLIDA';
    return ordenados.includes(hoy) ? 'ACTIVA_HOY' : 'EN_CURSO_DIA_NO_LECTIVO';
  }

  function crearMedidaAutorizada({alumnoId, mes, ciclo, fechaDeteccion,
                                   fechaAviso, autorizadoPor, rolAutorizante,
                                   calendario}) {
    if (!alumnoId || !/^\d{4}-\d{2}$/.test(mes)) throw Error('Alumno o mes inválido.');
    if (![1, 2].includes(ciclo)) throw Error('Solo se definen primer y segundo ciclo.');
    validarFecha(fechaDeteccion);
    validarFecha(fechaAviso);
    if (fechaAviso < fechaDeteccion) throw Error('Aviso anterior a la detección.');
    if (!String(autorizadoPor || '').trim() ||
        !['direccion', 'delegado_autorizado'].includes(rolAutorizante)) {
      throw Error('Falta autorización de Dirección o suplencia formal.');
    }
    const dias = ciclo === 1 ? 1 : 3;
    return {
      alumnoId, mes, ciclo, dias, estado: 'AUTORIZADA',
      fechaDeteccion, fechaAviso, autorizadoPor, rolAutorizante,
      diasLectivos: diasLectivosPosteriores(calendario, fechaAviso, dias)
    };
  }

  function incidenciasMes(incidencias, alumnoId, mes) {
    const porDia = new Map();
    for (const i of incidencias) {
      if (i.alumnoId !== alumnoId || !String(i.fecha || '').startsWith(mes + '-') ||
          !TIPOS.has(i.tipo) || i.excluida === true || i.computable === false) continue;
      validarFecha(i.fecha);
      // Regla conservadora: a lo sumo una incidencia computable por alumno y fecha.
      if (!porDia.has(i.fecha)) porDia.set(i.fecha, i);
    }
    return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function resumenAlumno({alumnoId, mes, hoy, incidencias, medidas}) {
    validarFecha(hoy);
    if (!/^\d{4}-\d{2}$/.test(mes)) throw Error('Mes inválido.');
    const delMes = incidenciasMes(incidencias, alumnoId, mes);
    const medidasMes = medidas.filter(m => m.alumnoId === alumnoId && m.mes === mes &&
                                            m.estado !== 'CANCELADA');
    for (const ciclo of [1, 2]) {
      if (medidasMes.filter(m => m.ciclo === ciclo).length > 1) {
        throw Error('Hay más de una medida vigente para el mismo ciclo.');
      }
    }
    let conteo = delMes;
    let cicloActual = 1;
    let pendiente = null;
    let revision = false;
    let motivo = '';
    for (const ciclo of [1, 2]) {
      const medida = medidasMes.find(m => m.ciclo === ciclo);
      if (!medida) {
        cicloActual = ciclo;
        revision = conteo.length >= 3;
        motivo = revision ? 'Tres incidencias: requiere revisión, aviso y autorización.' :
          'Sin medida pendiente.';
        break;
      }
      const estado = estadoMedida(medida, hoy);
      if (estado !== 'CUMPLIDA') {
        cicloActual = ciclo;
        pendiente = {...medida, estadoEfectivo: estado};
        motivo = estado === 'PENDIENTE_REVISION' ? 'En revisión: no restringir ingreso.' :
          'Medida autorizada; consultar los días exactos de aplicación.';
        break;
      }
      // Se reinicia el ciclo solo una vez cumplida la medida; nunca borrar historial.
      conteo = conteo.filter(i => i.fecha > [...medida.diasLectivos].sort().at(-1));
      cicloActual = ciclo + 1;
    }
    if (cicloActual === 3 && !pendiente) {
      motivo = 'Dos ciclos cumplidos: cualquier nueva situación requiere revisión individual.';
      revision = conteo.length >= 3;
    }
    const hoyRestriccion = medidas.some(m => m.alumnoId === alumnoId &&
      m.estado === 'AUTORIZADA' && estadoMedida(m, hoy) === 'ACTIVA_HOY');
    return {
      alumnoId, mes, totalMes: delMes.length, retardos: delMes.filter(i => i.tipo === 'Retardo de entrada').length,
      diferidos: delMes.filter(i => i.tipo === 'Ingreso diferido').length,
      conteoCiclo: conteo.length, cicloActual, requiereRevision: revision,
      medida: pendiente, restriccionAutorizadaHoy: hoyRestriccion, motivo
    };
  }

  return {validarFecha, diasLectivosPosteriores, estadoMedida,
          crearMedidaAutorizada, incidenciasMes, resumenAlumno};
});
