/* Homepage YouTube feed — add to the EXISTING comms-portal Code.gs
 * Version: 2026-09-10-b  ·  Last edited: 2026-09-10
 *
 * ============================================================
 * USE THE EXISTING SCRIPT — do not create a new project
 * ============================================================
 * Everything this needs is already set up in the comms-portal script:
 *
 *   · the YouTube Advanced Service is already enabled and in use by
 *     getYouTubeStats(), so there is NO API key to create
 *   · YT_CHANNEL_ID is already in Script Properties
 *   · warmCache already runs every 10 minutes
 *   · the homepage calendar already reads from this same web app
 *
 * A second project would mean a second deployment, a second set of
 * credentials and a second cache to keep warm, for no gain.
 *
 * ============================================================
 * INSTALL — two edits, both in Code.gs
 * ============================================================
 * 1. In doGet's type router, directly ABOVE the youtube_stats branch
 *    (around line 1617, `} else if (type === 'youtube_stats') {`),
 *    insert:
 *
 *        } else if (type === 'youtube_videos') {
 *          result = getHomepageVideos_(parseInt(e.parameter.count, 10) || 3);
 *
 * 2. Paste everything below this comment at the end of Code.gs.
 *
 * Then Deploy → Manage deployments → edit → New version.
 * (Editing the existing deployment keeps the same exec URL, so nothing
 * else that points at this script breaks.)
 *
 * Sanity check — paste in a browser:
 *   <exec-url>?type=youtube_videos&count=3
 * Expect: { videos: [ {id,title,description,thumb,url,published}, … ] }
 *
 * Optional: add 'youtube_videos' to the warmCache list so the homepage
 * never waits on a cold fetch.
 *
 * ============================================================
 * COST
 * ============================================================
 * Two Data API calls per cache miss, ~2 quota units, against a
 * 10,000/day free tier. With the 30-minute cache below that is roughly
 * 100 units a day — the same order as getYouTubeStats already uses.
 * ============================================================ */

var YT_VIDEOS_CACHE_KEY = 'homepage_videos_v2';
var YT_VIDEOS_CACHE_SECONDS = 1800;   // 30 minutes

function getHomepageVideos_(count) {
  count = Math.min(Math.max(count || 3, 1), 10);

  var cache = CacheService.getScriptCache();
  var key = YT_VIDEOS_CACHE_KEY + '_' + count;
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* fall through and refetch */ }
  }

  var channelId = PropertiesService.getScriptProperties().getProperty('YT_CHANNEL_ID');
  if (!channelId) {
    return { error: 'YT_CHANNEL_ID is not set in Script Properties. ' +
                    'It must be the channel id starting "UC…", not the @handle.' };
  }

  try {
    /* Same Advanced Service getYouTubeStats() already uses — no API key.
       The uploads playlist is the channel id with UC swapped for UU, but
       reading it from contentDetails is the documented way and survives
       any future change to that convention. */
    var ch = YouTube.Channels.list('contentDetails', { id: channelId });
    if (!ch.items || !ch.items.length) {
      return { error: 'Channel not found: ' + channelId };
    }
    var uploads = ch.items[0].contentDetails.relatedPlaylists.uploads;

    var list = YouTube.PlaylistItems.list('snippet', {
      playlistId: uploads,
      maxResults: count
    });

    var videos = (list.items || []).map(function (item) {
      var s = item.snippet || {};
      var id = (s.resourceId && s.resourceId.videoId) || '';
      return {
        id: id,
        title: s.title || '',
        description: _ytTrimDescription_(s.description || '', 180),
        /* Built from the id rather than read from the payload — the
           thumbnail set varies per video, this address never does. */
        thumb: id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '',
        url: id ? 'https://www.youtube.com/watch?v=' + id : '',
        published: s.publishedAt || ''
      };
    }).filter(function (v) { return !!v.id; });

    var payload = {
      videos: videos,
      count: videos.length,
      generated: new Date().toISOString()
    };
    cache.put(key, JSON.stringify(payload), YT_VIDEOS_CACHE_SECONDS);
    return payload;

  } catch (err) {
    return { error: String(err) };
  }
}

/* Descriptions on these videos usually open with a sentence or two of
   prose and then run into links, timestamps and boilerplate. Take the
   leading paragraph, drop any URLs, and cut on a word boundary. */
function _ytTrimDescription_(text, max) {
  var first = String(text).split(/\n\s*\n/)[0] || '';
  first = first.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (first.length <= max) return first;
  var cut = first.slice(0, max);
  var stop = cut.lastIndexOf(' ');
  return (stop > 0 ? cut.slice(0, stop) : cut) + '…';
}
