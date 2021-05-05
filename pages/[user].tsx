import Head from 'next/head';
import Link from 'next/link';
import prisma from '../lib/prisma';

export default function User(props) {
    const eventTypes = props.eventTypes.map(type =>
        <li key={type.id}>
            <Link href={'/' + props.user.username + '/' + type.slug}>
                <a className="block px-6 py-4">
                    <div className="inline-block w-3 h-3 rounded-full bg-blue-600 mr-2"></div>
                    <h2 className="inline-block font-medium">{type.title}</h2>
                    <p className="inline-block text-gray-400 ml-2">{type.description}</p>
                </a>
            </Link>
        </li>
    );
    return (
        <div>
            <Head>
                <title>{props.user.name || props.user.username} | ITC America</title>
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className="max-w-2xl mx-auto my-24">
                <div className="mb-8 text-center">
                    {/* <img src="itc-white.png" alt="ITC" className="mx-auto h-14 mb-4"/> */}
                    {props.user.avatar && <img src={props.user.avatar} alt="Avatar" className="mx-auto w-24 h-24 rounded-full mb-4"/>}
                    <h1 className="text-3xl font-semibold text-gray-200 mb-1">{props.user.name || props.user.username}</h1>
                    <p className="text-gray-300">{props.user.bio}</p>
                </div>
                <div className="bg-white shadow overflow-hidden rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {eventTypes}
                    </ul>
                    {eventTypes.length == 0 && 
                        <div className="p-8 text-center text-gray-400">
                            <h2 className="font-semibold text-3xl text-gray-600">Uh oh!</h2>
                            <p className="max-w-md mx-auto">This user hasn't set up any event types yet.</p>
                        </div>
                    }
                </div>
                <div className="flex justify-between mt-8">
                    <div>
                        <h1 className="text-3xl font-semibold text-gray-200 mb-1">ITC America</h1>
                        <p className="text-gray-300"><a href="https://itcamerica.net" target="_blank">www.itcamerica.net</a></p>
                        <p className="text-gray-300"><a href="tel:+17549005149">+1 (754) 900-5149</a></p>
                        <p className="text-gray-300">652 N University Drive, Pembroke Pines, Florida 33024</p>
                    </div>
                    <div>
                        <img src="../itc-white.png" alt="ITC" className="mx-auto h-14 mt-2"/>
                        <div className="flex justify-between">
                            <div>
                                <a href="https://www.facebook.com/ITCAmerica/" target="_blank"><img alt="Facebook" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/facebook2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="Facebook" width="32"/></a>
                            </div>
                            <div>
                                <a href="https://www.instagram.com/itcamerica/" target="_blank"><img alt="Instagram" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/instagram2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="Instagram" width="32"/></a>
                            </div>
                            <div>
                                <a href="https://www.linkedin.com/company/itc-america" target="_blank"><img alt="LinkedIn" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/linkedin2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="LinkedIn" width="32"/></a>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

export async function getServerSideProps(context) {
    const user = await prisma.user.findFirst({
        where: {
            username: context.query.user,
        },
        select: {
            id: true,
            username: true,
            name: true,
            bio: true,
            avatar: true,
            eventTypes: true
        }
    });

    if (!user) {
       return {
           notFound: true,
       }
    }

    const eventTypes = await prisma.eventType.findMany({
        where: {
            userId: user.id,
            hidden: false
        }
    });

    return {
        props: {
            user,
            eventTypes
        },
    }
}  