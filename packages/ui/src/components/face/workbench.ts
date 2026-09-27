/**
 * What the face lab reads (issue #140): the face's player, its drawing, the tables it plays from
 * and the head that lays it out.
 *
 * Not the design system's surface. The application draws `Face`, whose whole say is a state, a
 * size and a seed; this is for the tool that slows the face down, takes it apart and tries other
 * numbers on it — which is why it has a door of its own rather than a place in the catalogue.
 */
export { CHOREOGRAPHIES, changeBetween, type ChangeName } from './changes.ts'
export { FACE_SIZES, Face, SIZE_CLASSES, detailOf, type FaceProps, type FaceSize } from './face.tsx'
export { FaceFigure, type FacePainter } from './figure.tsx'
export {
  FLOURISHES,
  MOTIONS,
  between,
  dice,
  strand,
  type FlourishName,
  type MotionKind,
} from './life.ts'
export {
  DETAILS,
  TUNING,
  createFace,
  type DetailName,
  type FaceDetail,
  type FaceFrame,
  type FaceLayer,
  type FaceLife,
  type FacePlayer,
  type FaceTiming,
  type FaceTuning,
} from './player.ts'
export { AT, TONES, TONE_CLASSES, tonesOf, type FaceTone, type Pose } from './pose.ts'
export { VIEW, drawnOf, pathOf, type Drawn, type DrawnStroke } from './rig.ts'
export { EXPRESSIONS, FACE_STATES, type Expression, type FaceState } from './states.ts'
export { clock, onFrame } from './ticker.ts'
