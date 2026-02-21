import { chromium, type Browser, type Locator } from 'playwright';
import fs from 'fs';

let browserSingleton: Browser | null = null;

export const scrapeMoviesList = async () => {
  try {
    browserSingleton = await chromium.launch({ headless: false });
    const content = await scrapeMovies(browserSingleton);
    // console.log(JSON.stringify(content, null, 2));
    fs.writeFileSync('movies.json', JSON.stringify(content, null, 2));
    return content;
  } catch (error) {
    console.error('ERROR: ', error);
    throw error;
  } finally {
    await browserSingleton?.close();
  }
}

const baseUrl = 'https://guia.curitiba.pr.gov.br'

const scrapeMovies = async (browser: Browser) => {
  let movies: ScrappedMovie[] = [];

  const url = `${baseUrl}/Evento/Listar/?pesquisa=cinemateca`
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  
  const allCards = page.locator('body > section:nth-child(7) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(4) > div:nth-child(1) > div')
  if (!allCards)
    throw new Error('all cards div not found');

  const moviesLocators = await allCards.all();
  const promises = moviesLocators.map(movieLocator => {
    try {
      return parseMovieCard(browser, movieLocator)
    } catch (error) {
      console.log('Retrying to parse movie card...');
      return parseMovieCard(browser, movieLocator)
    }
  });
  const parsedMovies = await Promise.all(promises);
  movies = parsedMovies.filter(movie => movie !== undefined);

  await page.close()

  return movies;
}

type ScrappedMovie = {
  /** ISO 8601 string date */
  scrappedAt: string
  rawOriginHTML: string
  place: string
  imageURL: string
  eventName: string
  when: string
  moreInfoURL: string
  startTime: string
  endTime: string
  description: string
}

const parseMovieCard = async (browser: Browser, cardLocator: Locator): Promise<ScrappedMovie | undefined> => {
  let rawOriginHTML = await cardLocator.innerHTML()
  rawOriginHTML = rawOriginHTML.replaceAll(/\n/g, '').replaceAll(/\t/g, '');

  let place = await cardLocator.locator('.evento-conteudo div p a').innerText()
  place = place.trim().toLowerCase()
  if (!place) {
    console.error('place not found');
    return
  }
  if (place !== 'cinemateca de curitiba') {
    console.error('place is not cinemateca de curitiba');
    return
  }

  let imageURL = await cardLocator.locator('.evento-midia img').getAttribute('src')
  if (!imageURL) imageURL = 'https://mid-noticias.curitiba.pr.gov.br/2025/00489724.jpg'

  let eventName = await cardLocator.locator('.evento-conteudo h5').innerText()
  eventName = eventName.trim()
  if (!eventName) eventName = 'Evento sem nome'

  let when = await cardLocator.locator('.evento-conteudo p.evento-info:first-of-type').innerText()
  when = when.trim()
  if (!when) {
    console.error('when not found');
    return
  }

  let moreInfoURL = await cardLocator.locator('.evento-card>a').getAttribute('href')
  if (!moreInfoURL) {
    console.error('moreInfoURL not found');
    return
  }
  moreInfoURL = `${baseUrl}${moreInfoURL}`

  const moreInfoPage = await browser.newPage();
  await moreInfoPage.goto(moreInfoURL);
  await moreInfoPage.waitForLoadState('networkidle');

  let startTime = await moreInfoPage.locator("ul[class='lista-data-evento'] li:nth-child(1)").innerText()
  startTime = startTime.trim()
  if (!startTime) {
    console.error('startTime not found');
    return
  }

  let endTime = await moreInfoPage.locator("ul[class='lista-data-evento'] li:nth-child(2)").innerText()
  endTime = endTime.trim()
  if (!endTime) {
    console.error('endTime not found');
    return
  }

  let description = await moreInfoPage.locator("#descricao").innerText()
  description = description.trim().replaceAll('\n\n', ' ')
  if (description.toLowerCase().startsWith('descrição')) description = description.slice(10).trim()
  if (!description) {
    console.error('description not found');
    return
  }

  await moreInfoPage.close();

  return {
    scrappedAt: new Date().toISOString(),
    rawOriginHTML,
    place,
    imageURL,
    eventName,
    when,
    moreInfoURL,
    startTime,
    endTime,
    description,
  }
}

scrapeMoviesList()