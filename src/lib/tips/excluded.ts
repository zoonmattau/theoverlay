/**
 * Calls taken off the record. The $10+ bets from 11 to 15 Sep 2026 were
 * priced before the meld (1e34ee4, 15 Sep), when our ratings over-priced
 * long shots; the user dropped them from every record on 2 Oct 2026. Their
 * rows are kept in marketing/results/excluded/tips-2026-09-11-15.json. The
 * stored cards for those days still mark them as bets, so a re-settle would
 * write them back: recordTips skips anything here. raceId:tabNumber.
 */
export const EXCLUDED_CALLS = new Set([
  "BORD_110926_9:4", "TUNC_110926_7:7", "GOUL_110926_3:3", "GOUL_110926_3:4", "FLEM_120926_3:2", "FLEM_120926_5:9", "FLEM_120926_7:2", "FLEM_120926_7:3", "FLEM_120926_10:3", "RHIL_120926_4:3", "RHIL_120926_6:2", "RHIL_120926_10:3", "DOOM_120926_1:7", "DOOM_120926_7:14", "DOOM_120926_8:4", "K GR_120926_2:8", "K GR_120926_4:2", "K GR_120926_4:4", "K GR_120926_5:7", "GCST_120926_4:5", "MORP_120926_4:2", "MORP_120926_4:3", "MORP_120926_6:2", "MORP_120926_6:3", "MORP_120926_7:4", "GRIF_120926_6:7", "THAN_120926_5:1", "BLMT_120926_1:5", "ALSP_120926_3:3", "TWBA_120926_1:3", "TWBA_120926_4:1", "TWBA_120926_4:7", "TWBA_120926_6:1", "TWBA_120926_6:2", "DALB_130926_2:1", "SALE_130926_5:3", "KILM_130926_6:1", "BATH_130926_6:10", "TAMW_140926_6:1", "COR_140926_4:1", "WELL_150926_7:5", "WELL_150926_7:8", "WELL_150926_7:11", "WELL_150926_8:3", "MRYA_150926_7:8",
]);
