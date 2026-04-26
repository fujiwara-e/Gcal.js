export class Calendar {
  /**
   * Create Calendar instance.
   *
   * @param {String} id
   * @param {String} summary
   * @param {String | null} colorId
   * @param {String | null} backgroundColor
   * @param {String | null} syncToken
   * @return {Calendar}
   */
  constructor(id, summary, colorId = null, backgroundColor = null, syncToken = null) {
    this.id = id;
    this.summary = summary;
    this.colorId = colorId;
    this.backgroundColor = backgroundColor;
    this.syncToken = syncToken;
  }
}
