type VerificationBannerProps = {
  emailVerified: boolean;
};

export function VerificationBanner({ emailVerified }: VerificationBannerProps) {
  if (emailVerified) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300/40 bg-amber-100/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-2 text-center">
        <p className="text-sm font-medium text-amber-900">
          Tu cuenta esta en modo borrador. Confirma tu email para activar tu menu publico y recibir pedidos.
        </p>
      </div>
    </div>
  );
}
