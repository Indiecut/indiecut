export type FilmstripLoadRequest = {
  type: "load";
  assetId: string;
  buffer: ArrayBuffer;
  mimeHint?: string;
};

export type FilmstripTileRequest = {
  type: "tile";
  requestId: number;
  assetId: string;
  /** Source time in seconds */
  timestampSec: number;
  tileIndex: number;
  zoomBucket: number;
  width: number;
  height: number;
};

export type FilmstripUnloadRequest = {
  type: "unload";
  assetId: string;
};

export type FilmstripWorkerRequest =
  | FilmstripLoadRequest
  | FilmstripTileRequest
  | FilmstripUnloadRequest;

export type FilmstripLoaded = {
  type: "loaded";
  assetId: string;
};

export type FilmstripTileResult = {
  type: "tile";
  requestId: number;
  assetId: string;
  tileIndex: number;
  zoomBucket: number;
  jpeg?: ArrayBuffer;
  error?: string;
};

export type FilmstripFailure = {
  type: "failure";
  assetId?: string;
  error: string;
};

export type FilmstripWorkerResponse =
  | FilmstripLoaded
  | FilmstripTileResult
  | FilmstripFailure;
