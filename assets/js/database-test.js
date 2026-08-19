/* Small, non-sensitive connection test used during setup. */
(function () {
  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.salonDatabase || !window.salonDatabase.isConfigured) return;

    try {
      var result = await window.salonSupabase
        .from('services')
        .select('id', { count: 'exact', head: true });

      if (result.error) throw result.error;
      console.info('Salon database connection OK. Services currently in database:', result.count || 0);
    } catch (error) {
      console.error('Salon database connection failed:', error);
    }
  });
})();
