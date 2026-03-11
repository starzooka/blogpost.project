import { useEffect } from 'react';

function ImageLightbox({ imageUrl, onClose, alt = 'Post image' }) {
  useEffect(() => {
    if (!imageUrl) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return (
    <div className="image-lightbox" onClick={onClose} role="presentation">
      <button
        type="button"
        className="image-lightbox-close"
        onClick={onClose}
        aria-label="Close full-screen image"
      >
        x
      </button>
      <img
        src={imageUrl}
        alt={alt}
        className="image-lightbox-image"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export default ImageLightbox;
