// Express deduce el tipo de `:id` del texto de la ruta ({ id: string }) y el de req.query
// (ParsedQs, siempre texto), y no admite declararlos number en el handler; validate() ya los
// dejó convertidos. Si llega texto, la ruta se armó sin validate: es un bug (500), no un 400.
function numberOf(source: object, name: string, route: string): number {
  const value = (source as Record<string, unknown>)[name];
  if (typeof value !== 'number') throw new Error(`${route} sin validate()`);
  return value;
}

// `:id` validado con validate({ params: idParams }).
export const idOf = (req: { params: object }) => numberOf(req.params, 'id', 'Ruta con :id');

// Parámetro de consulta validado con validate({ query: ... }), p. ej. ?floor_id=.
export const queryIdOf = (req: { query: object }, name: string) => numberOf(req.query, name, `Ruta con ?${name}=`);
