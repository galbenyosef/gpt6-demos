import * as document from '../src/document';
import * as render from '../src/render';
import * as persistence from '../src/persistence';
import * as scheduler from '../src/scheduler';
import * as engine from '../src/engine';
import * as theory from '../src/theory';
import * as sampler from '../src/sampler';
import * as validation from '../src/validation';
Object.assign(window, {
  tonada: {
    ...document,
    ...render,
    ...persistence,
    ...scheduler,
    ...engine,
    ...theory,
    ...sampler,
    ...validation,
  },
});
