(function(){
  'use strict';
  
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  async function enhanceTeamStats() {
    const url = location.href;
    const teamMatch = url.match(/team_instance\/(\d+)/);
    const seasonMatch = url.match(/subseason=(\d+)/);
    
    if (!teamMatch || !seasonMatch) return;
    
    const teamInstanceId = teamMatch[1];
    const season = seasonMatch[1];
    
    // Use team-specific cache key to avoid mixing rosters from different teams
    const cacheKey = `team_roster_${teamInstanceId}_${season}`;
    
    let playerData;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const parsedCache = JSON.parse(cached);
      
      // Check if cache is in old format - if so, clear it
      const sampleKey = Object.keys(parsedCache.data || {})[0];
      const isOldFormat = sampleKey && !sampleKey.includes('_');
      
      if (isOldFormat) {
        console.log('Old cache format detected, clearing and refetching');
        localStorage.removeItem(cacheKey);
        playerData = await fetchRosterData(season);
        localStorage.setItem(cacheKey, JSON.stringify({
          data: playerData,
          timestamp: Date.now()
        }));
      } else if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
        console.log('Using cached roster data for team', teamInstanceId);
        playerData = parsedCache.data;
        console.log('Sample cache keys:', Object.keys(playerData).slice(0, 3));
      } else {
        console.log('Cache expired, fetching fresh data');
        playerData = await fetchRosterData(season);
        localStorage.setItem(cacheKey, JSON.stringify({
          data: playerData,
          timestamp: Date.now()
        }));
      }
    } else {
      console.log('No cache, fetching roster data');
      playerData = await fetchRosterData(season);
      localStorage.setItem(cacheKey, JSON.stringify({
        data: playerData,
        timestamp: Date.now()
      }));
    }
    
    if (!playerData || Object.keys(playerData).length === 0) {
      console.log('No roster data available');
      return;
    }
    
    console.log('Roster data loaded:', Object.keys(playerData).length, 'players');
    
    // Enhance all stat tables
    document.querySelectorAll('table').forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent.trim());
      if (headers.includes('#') && headers.includes('Name')) {
        enhanceTable(table, playerData);
      }
    });
  }
  
  async function fetchRosterData(season) {
    // Find the roster link on the page
    let rosterUrl;
    
    // Try to find direct roster link
    const rosterLink = document.querySelector('a[href*="/roster/show/"]');
    if (rosterLink && rosterLink.href.includes('subseason')) {
      rosterUrl = rosterLink.href;
    } else {
      // Try to find "Roster" text link
      const links = Array.from(document.querySelectorAll('a'));
      const rosterTextLink = links.find(a => 
        a.textContent.trim() === 'Roster' && a.href.includes('/roster/')
      );
      
      if (rosterTextLink && rosterTextLink.href.includes('subseason')) {
        rosterUrl = rosterTextLink.href;
      } else {
        // Try to construct from team page link
        const teamPageLink = document.querySelector('a[href*="/page/show/"]');
        if (teamPageLink) {
          const teamIdMatch = teamPageLink.href.match(/page\/show\/(\d+)/);
          if (teamIdMatch) {
            rosterUrl = `https://www.legacy.hockey/roster/show/${teamIdMatch[1]}?subseason=${season}`;
          }
        }
      }
    }
    
    if (!rosterUrl) {
      console.log('Could not find roster URL');
      return {};
    }
    
    console.log('Fetching roster from:', rosterUrl);
    
    try {
      const response = await fetch(rosterUrl);
      if (!response.ok) {
        console.log('Roster fetch failed:', response.status);
        return {};
      }
      
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const playerMap = {};
      
      // Parse roster table
      doc.querySelectorAll('table tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const number = cells[0]?.textContent?.trim();
          const nameLink = cells[2]?.querySelector('a');
          const playerName = nameLink?.textContent?.trim();
          const position = cells[3]?.textContent?.trim();
          const grade = cells[4]?.textContent?.trim();
          
          if (number && playerName && number !== 'MGR') {
            // Create a normalized key for matching
            const normalizedName = playerName.toLowerCase().replace(/[^a-z]/g, '');
            const key = `${number}_${normalizedName}`;
            
            playerMap[key] = {
              number: number,
              name: playerName,
              position: position || '',
              grade: grade || ''
            };
          }
        }
      });
      
      console.log('Parsed roster:', Object.keys(playerMap).length, 'players');
      return playerMap;
    } catch (error) {
      console.error('Error fetching roster:', error);
      return {};
    }
  }
  
  function enhanceTable(table, playerData) {
    const headerRow = table.querySelector('thead tr');
    const bodyRows = table.querySelectorAll('tbody tr');
    
    if (!headerRow || bodyRows.length === 0) return;
    
    // Check if already enhanced
    if (headerRow.textContent.includes('Pos') || headerRow.textContent.includes('Grade')) {
      console.log('Table already enhanced');
      return;
    }
    
    const headers = headerRow.querySelectorAll('th');
    let numberIndex = -1;
    let nameIndex = -1;
    
    headers.forEach((header, index) => {
      const text = header.textContent.trim();
      if (text === '#') numberIndex = index;
      if (text === 'Name') nameIndex = index;
    });
    
    if (numberIndex === -1 || nameIndex === -1) {
      console.log('Could not find # or Name columns');
      return;
    }
    
    const sampleHeader = headers[0];
    
    // Add Position header
    const posHeader = document.createElement('th');
    posHeader.textContent = 'Pos';
    posHeader.className = sampleHeader.className;
    posHeader.style.cssText = 'text-align: center; font-weight: bold; cursor: pointer;';
    posHeader.title = 'Sort by Position';
    posHeader.onclick = () => sortTable(table, nameIndex + 1);
    
    // Add Grade header
    const gradeHeader = document.createElement('th');
    gradeHeader.textContent = 'Grade';
    gradeHeader.className = sampleHeader.className;
    gradeHeader.style.cssText = 'text-align: center; font-weight: bold; cursor: pointer;';
    gradeHeader.title = 'Sort by Grade';
    gradeHeader.onclick = () => sortTable(table, nameIndex + 2);
    
    // Insert headers after Name column
    headers[nameIndex].after(gradeHeader);
    headers[nameIndex].after(posHeader);
    
    // Update sort handlers for columns after the inserted ones
    // They need to account for the 2 new columns
    const allHeaders = headerRow.querySelectorAll('th');
    allHeaders.forEach((header, index) => {
      if (index > nameIndex + 2 && header.onclick) {
        const oldHandler = header.onclick;
        header.onclick = function() {
          // Extract the original column index from the handler
          const match = oldHandler.toString().match(/sortTable\(table,\s*(\d+)\)/);
          if (match) {
            const originalIndex = parseInt(match[1]);
            // Add 2 to account for the new columns
            sortTable(table, originalIndex + 2);
          }
        };
      }
    });
    
    let matchedCount = 0;
    
    // Add data to rows
    bodyRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;
      
      const number = cells[numberIndex]?.textContent?.trim();
      const nameCell = cells[nameIndex];
      const nameLink = nameCell?.querySelector('a');
      const playerName = nameLink?.textContent?.trim() || nameCell?.textContent?.trim();
      
      let position = '';
      let grade = '';
      
      if (number && playerName) {
        // Try to match player
        const normalizedName = playerName.toLowerCase().replace(/[^a-z]/g, '');
        const key = `${number}_${normalizedName}`;
        
        const playerInfo = playerData[key];
        if (playerInfo) {
          position = playerInfo.position;
          grade = playerInfo.grade;
          matchedCount++;
        } else {
          console.log('No match for:', number, playerName, 'key:', key);
        }
      }
      
      // Create Position cell
      const posCell = document.createElement('td');
      posCell.textContent = position;
      posCell.className = cells[0].className;
      posCell.style.cssText = 'text-align: center; font-weight: 600;';
      
      // Create Grade cell
      const gradeCell = document.createElement('td');
      gradeCell.textContent = grade;
      gradeCell.className = cells[0].className;
      gradeCell.style.textAlign = 'center';
      
      // Insert cells after Name column
      cells[nameIndex].after(gradeCell);
      cells[nameIndex].after(posCell);
    });
    
    console.log(`Enhanced table: ${matchedCount}/${bodyRows.length} players matched`);
  }
  
  function sortTable(table, columnIndex) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    const currentDir = table.dataset[`sort${columnIndex}`];
    const direction = currentDir === 'asc' ? 'desc' : 'asc';
    table.dataset[`sort${columnIndex}`] = direction;
    
    rows.sort((a, b) => {
      const aVal = a.querySelectorAll('td')[columnIndex]?.textContent?.trim() || '';
      const bVal = b.querySelectorAll('td')[columnIndex]?.textContent?.trim() || '';
      
      if (direction === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });
    
    rows.forEach(row => tbody.appendChild(row));
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(enhanceTeamStats, 1500));
  } else {
    setTimeout(enhanceTeamStats, 1500);
  }
  
})();
