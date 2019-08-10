const Apify = require('apify');

function textTruncate(str, length, ending) {
    if (length == null) {
        length = 100;
    }
    if (ending == null) {
        ending = '...';
    }
    if (str.length > length) {
        return str.substring(0, length - ending.length) + ending;
    }
    return str;
}

Apify.main(async () => {
    // Get input of the actor (here only for demonstration purposes).
    // If you'd like to have your input checked and have Apify display
    // a user interface for it, add INPUT_SCHEMA.json file to your actor.
    // For more information, see https://apify.com/docs/actor/input-schema
    const input = await Apify.getInput();
    const { startUrl, email, test, ccEmail } = input;
    const detailsQueue = await Apify.openRequestQueue('volvo');
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: startUrl,
        userData: {
            label: 'LIST',
        },
    });

    // Create a basic crawler that will use request-promise to download
    // web pages from a given list of URLs
    const basicCrawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['CZECH_LUMINATI'],
        maxConcurrency: 2,
        handlePageFunction: async ({ $, request }) => {
            if (request.userData.label === 'LIST') {
                const vehicleSelector = $('div.vehicle-inner');
                const detailUrls = [];
                if (vehicleSelector.length !== 0) {
                    vehicleSelector.each(function () {
                        const detailUrl = `https://selekt.volvocars.cz${$(this).find('a.title').attr('href')}`;
                        const image = $(this).find('img').length !== 0 ? $(this).find('img').attr('src') : null;
                        detailUrls.push({
                            detailUrl,
                            image,
                        });
                    });
                    console.log(`Checking of ${detailUrls.length} details`);
                    for (const detailUrl of detailUrls) {
                        const responseQueue = await detailsQueue.addRequest({
                            url: detailUrl.detailUrl,
                            userData: {
                                label: 'DETAIL',
                                image: detailUrl.image,
                            },
                        });
                        if (responseQueue.wasAlreadyPresent !== true) {
                            await requestQueue.addRequest({
                                url: detailUrl.detailUrl,
                                userData: {
                                    label: 'DETAIL',
                                    image: detailUrl.image,
                                },
                            });
                        }
                    }
                    const pageUrl = request.url.split('?');
                    const nextUrlNumber = pageUrl[0].match(/\d+/) ? parseInt(pageUrl[0].match(/\d+/)[0], 10) + 1 : null;
                    if (nextUrlNumber !== null) {
                        const nextUrl = `${pageUrl[0].replace(/\d+/, nextUrlNumber)}?${pageUrl[1]}`;
                        console.log(nextUrl);
                        await requestQueue.addRequest({
                            url: nextUrl,
                            userData: {
                                label: 'LIST',
                            },
                            uniqueKey: Math.random().toString(),
                        });
                    }
                }
            } else if (request.userData.label === 'DETAIL') {
                let price;

                const title = $('h1 .s-hide').length !== 0 ? $('h1 .s-hide').text() : null;
                const priceDiscounted = $('.prev-price').length !== 0 ? $('.prev-price').text().trim() : null;
                if ($('script:contains("dataLayer")').length !== 0) {
                    const dataLayer = JSON.parse($('script:contains("dataLayer")').text().replace('var dataLayer = ', '').replace(';', '')
                        .trim())[0];
                    price = dataLayer.VehiclePrice;
                }

                const details = {};
                $('table>tbody>tr').each(function () {
                    const key = $(this).find('td').eq(0).text()
                        .trim();
                    const value = $(this).find('td').eq(1).text()
                        .trim();
                    details[key] = value;
                });

                const description = $('div.description').length !== 0 ? $('div.description').last().text() : null;

                const result = {
                    title,
                    priceDiscounted,
                    price,
                    description,
                    details,
                    url: request.url,
                    img: request.userData.image,
                };
                await Apify.pushData(result);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#isFailed': true,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    await basicCrawler.run();
    console.log('Crawling done, now build the email and send it.');
    // build the email and send it

    const env = await Apify.getEnv();
    const dataset = await Apify.openDataset(env.defaultDatasetId);

    const emailBodyRows = [];
    await dataset.forEach(async (item) => {
        const bulletPoints = [];
        Object.keys(item.details).forEach((detail) => {
            bulletPoints.push(`<li>${detail} - ${item.details[detail]}</li>`);
        });
        emailBodyRows.push(`
                    <tr>
                        <td><a href=${item.url}>${item.title}</a></td>
                        <td><img src=${item.img}></td> 
                        <td>${item.price}</td> 
                        <td>${item.priceDiscounted}</td> 
                        <td>${textTruncate(item.description, 300)}</td> 
                        <td><ul>${bulletPoints.join('')}</ul></td> 
                    </tr>`);
    });

    if (!test && emailBodyRows.length !== 0) {
        await Apify.call(
            'apify/send-mail',
            {
                to: email,
                cc: ccEmail,
                subject: 'Nová Volva Selekt',
                html: `<b>New cars</b>
                            <table border="1">
                                  <tr>
                                    <th>Title</th>
                                    <th>Image</th> 
                                    <th>Price</th>
                                    <th>Original price</th>
                                    <th>Description</th>
                                    <th>details</th>
                                  </tr>
                                  ${emailBodyRows.join('')}
                                </table><br />`,
            },
            { waitSecs: 0 },
        );
        console.log('Email sent.');
    }
    console.log('Finished.');
});
