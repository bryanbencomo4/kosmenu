export type ZoomOffice = {
  id: string;
  title: string;
  estado: string;
  ciudad: string;
  address: string;
  phone?: string;
  lat?: number;
  lng?: number;
};

/** Curated fallback when live Zoom scrape/API fails. */
export const ZOOM_OFFICES_FALLBACK: ZoomOffice[] = [
  { id: 'fb-ccs-chacao', title: 'Zoom Chacao', estado: 'Miranda', ciudad: 'Caracas', address: 'Chacao, Caracas' },
  { id: 'fb-ccs-altamira', title: 'Zoom Altamira', estado: 'Miranda', ciudad: 'Caracas', address: 'Altamira, Caracas' },
  { id: 'fb-ccs-las-mercedes', title: 'Zoom Las Mercedes', estado: 'Miranda', ciudad: 'Caracas', address: 'Las Mercedes, Caracas' },
  { id: 'fb-ccs-ccct', title: 'Zoom CCCT', estado: 'Miranda', ciudad: 'Caracas', address: 'Centro Ciudad Comercial Tamanaco' },
  { id: 'fb-ccs-la-california', title: 'Zoom La California', estado: 'Miranda', ciudad: 'Caracas', address: 'La California, Caracas' },
  { id: 'fb-ccs-el-parral', title: 'Zoom El Parral', estado: 'Miranda', ciudad: 'Caracas', address: 'El Parral, Caracas' },
  { id: 'fb-mcy-centro', title: 'Zoom Maracay Centro', estado: 'Aragua', ciudad: 'Maracay', address: 'Maracay' },
  { id: 'fb-val-centro', title: 'Zoom Valencia', estado: 'Carabobo', ciudad: 'Valencia', address: 'Valencia' },
  { id: 'fb-barq', title: 'Zoom Barquisimeto', estado: 'Lara', ciudad: 'Barquisimeto', address: 'Barquisimeto' },
  { id: 'fb-mbo', title: 'Zoom Maracaibo', estado: 'Zulia', ciudad: 'Maracaibo', address: 'Maracaibo' },
  { id: 'fb-bjq', title: 'Zoom Barcelona', estado: 'Anzoátegui', ciudad: 'Barcelona', address: 'Barcelona' },
  { id: 'fb-pto', title: 'Zoom Puerto La Cruz', estado: 'Anzoátegui', ciudad: 'Puerto La Cruz', address: 'Puerto La Cruz' },
  { id: 'fb-mat', title: 'Zoom Maturín', estado: 'Monagas', ciudad: 'Maturín', address: 'Maturín' },
  { id: 'fb-cum', title: 'Zoom Cumaná', estado: 'Sucre', ciudad: 'Cumaná', address: 'Cumaná' },
  { id: 'fb-bci', title: 'Zoom Barinas', estado: 'Barinas', ciudad: 'Barinas', address: 'Barinas' },
  { id: 'fb-sjc', title: 'Zoom San Cristóbal', estado: 'Táchira', ciudad: 'San Cristóbal', address: 'San Cristóbal' },
  { id: 'fb-mrd', title: 'Zoom Mérida', estado: 'Mérida', ciudad: 'Mérida', address: 'Mérida' },
  { id: 'fb-pzo', title: 'Zoom Puerto Ordaz', estado: 'Bolívar', ciudad: 'Puerto Ordaz', address: 'Puerto Ordaz' },
  { id: 'fb-cbl', title: 'Zoom Cabimas', estado: 'Zulia', ciudad: 'Cabimas', address: 'Cabimas' },
  { id: 'fb-guacara', title: 'Zoom Guacara', estado: 'Carabobo', ciudad: 'Guacara', address: 'Guacara' },
];
