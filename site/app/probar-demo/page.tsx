import type { Metadata } from 'next';

import { publicSiteUrl } from '../_lib/public-site-config';
import { ProbarDemoView } from '../../components/demo/ProbarDemoView';

const canonicalUrl = `${publicSiteUrl}/probar-demo`;

export const metadata: Metadata = {
  title: 'Prueba el demo interactivo | ElMenúXFA',
  description:
    'Explora un menú digital real: navega categorías, agrega productos al carrito, paga y sigue el pedido en vivo, todo desde tu celular.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function ProbarDemoPage() {
  return <ProbarDemoView />;
}
