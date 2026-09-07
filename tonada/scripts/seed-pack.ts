import { makeTrack, defaultVoice } from '../src/document';
const names = [
  'Bombo redondo',
  'Caja polvorienta',
  'Charles de seda',
  'Bajo analógico',
  'Teclas de cristal',
  'Púa de cobre',
  'Aire suave',
];
const presets = Array.from({ length: 7 }, (_, i) => {
  const tr = makeTrack(i);
  return { id: String(i), name: { en: tr.instrument, es: names[i] }, voice: tr.voice };
});
await Bun.write(
  'public/packs/essentials/pack.json',
  JSON.stringify(
    {
      slug: 'essentials',
      name: { en: 'Tonada essentials', es: 'Esenciales de Tonada' },
      description: {
        en: 'Seven synthesized voices and a generated sampled pluck.',
        es: 'Siete voces sintetizadas y una muestra de cuerda generada.',
      },
      presets: [
        ...presets,
        {
          id: 'wood',
          name: { en: 'Wooden tine', es: 'Lámina de madera' },
          voice: { ...defaultVoice, mode: 'sampler' },
          generator: { id: 'pluck', frequency: 261.625565, duration: 1.5 },
        },
      ],
    },
    null,
    2,
  ),
);
